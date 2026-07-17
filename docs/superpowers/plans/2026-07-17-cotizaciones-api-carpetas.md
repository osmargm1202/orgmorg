# Cotizaciones API y Carpetas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir orgmorg en un cliente Ink mínimo que valida una API key, busca cotizaciones por nombre de proyecto, crea o completa la carpeta correspondiente y guarda el PDF actualizado dentro de `Oferta`.

**Architecture:** Conservar la infraestructura Ink existente y reemplazar SQLite por dos unidades aisladas: `AdminApiClient` para HTTP autenticado y `project-folders` para operaciones transaccionales de archivos. La UI dependerá de interfaces inyectables para poder probar búsqueda, configuración y creación sin tocar producción ni disco real.

**Tech Stack:** TypeScript 5.7, Node.js 22 Fetch API, React 19, Ink 6, fs-extra, Vitest, ink-testing-library.

## Global Constraints

- Configuración obligatoria en `~/.config/orgmorg/config.json`: `apiBaseUrl`, `basePath`, `apiKey`.
- Endpoint sugerido: `https://admin-api.or-gm.com`; HTTP solo se permite para `localhost`, `127.0.0.1` y `::1`.
- Autenticación: `Authorization: Bearer <apiKey>`; la key debe comenzar con `orgm_` y nunca mostrarse completa.
- Permisos requeridos: `cotizaciones:ver`, `proyectos:ver`, `cotizaciones:imprimir`.
- Búsqueda final exclusivamente por nombre de proyecto, insensible a mayúsculas y acentos.
- Una cotización por operación; resultados ordenados por ID descendente.
- Carpeta: `<id_cotización> - <nombre_proyecto_saneado>`; componente de proyecto limitado a 120 caracteres.
- PDF: `Oferta/cotizacion_<id>.pdf`.
- Carpeta existente: conservar archivos, crear directorios faltantes y reemplazar solo PDF.
- Reintentos GET: 500 ms y 1.5 s; timeout JSON 15 s y PDF 120 s; no reintentar `401`, `403` ni `404`.
- Directorio de configuración `0700` y archivo `0600` cuando plataforma lo soporte.
- Solo comandos `menu`, `--help` y `--version`; ningún acceso a funciones retiradas.
- Pruebas usan servidor/fetch simulado; nunca dependen de producción.

## File Structure

### Crear

- `src/admin-api.ts` — autenticación, búsqueda, resolución de proyectos, reintentos y descarga PDF.
- `src/services/project-folders.ts` — saneamiento, vista previa, plantilla y escritura segura.
- `src/cli/ui/screens/SearchQuotationScreen.tsx` — flujo búsqueda → resultados → confirmación → creación.
- `src/cli/ui/screens/ApiKeyScreen.tsx` — captura oculta, validación y persistencia de key.
- `tests/config.test.ts` — configuración, permisos y enmascarado.
- `tests/admin-api.test.ts` — contrato HTTP, filtrado, errores, reintentos y PDF.
- `tests/project-folders.test.ts` — carpetas nuevas/existentes, saneamiento y limpieza.
- `tests/settings-ui.test.tsx` — configuración y secreto oculto.
- `tests/search-ui.test.tsx` — flujo interactivo completo con dependencias falsas.
- `tests/cli.test.ts` — ayuda, versión y rechazo de comandos antiguos.
- `tests/workflow.integration.test.ts` — backend loopback real y sistema de archivos temporal.
- `vitest.config.ts` — entorno y patrón de pruebas.

### Modificar

- `package.json`, `package-lock.json` — versión 2.0.0, scripts de prueba y dependencias.
- `src/config.ts` — nuevo modelo seguro de configuración.
- `src/index.ts` — entrada mínima: menú, ayuda y versión.
- `src/cli/runMenu.tsx` — render sin interferencia de consola.
- `src/cli/ui/App.tsx` — navegación reducida.
- `src/cli/ui/types.ts` — seis identificadores de pantalla válidos.
- `src/cli/ui/screens/MainMenuScreen.tsx` — buscar, configuración, salir.
- `src/cli/ui/screens/ConfiguracionesMenuScreen.tsx` — endpoint, carpeta base, API key.
- `src/cli/ui/screens/ConfigValueScreen.tsx` — endpoint/carpeta base con validación específica.

### Eliminar

- `src/bootstrap-mapping.ts`
- `src/config-cmd.ts`
- `src/db-cmd.ts`
- `src/db-init.ts`
- `src/db.ts`
- `src/import.ts`
- `src/organize.ts`
- `src/organize-by-date.ts`
- `src/project.ts`
- `src/schema-sqlite.ts`
- `src/services/cotizaciones.ts`
- `src/cli/ui/utils/captureConsoleOutput.ts`
- Pantallas antiguas: `ConfigPathScreen.tsx`, `ConsultarMenuScreen.tsx`, `CrearProyectoScreen.tsx`, `EditarProyectoScreen.tsx`, `ListarProyectosScreen.tsx`, `OrganizeByDateMenuScreen.tsx`, `OrganizeByDateScreen.tsx`, `OrganizeByTypeScreen.tsx`, `RecrearCarpetaScreen.tsx`, `UltimoNumeroScreen.tsx`.
- Datasets/runtime local: `cotizaciones_proyctos.json`, `data/`, `exports/`, `schema/`.

---

### Task 1: Test Harness and Secure Configuration

**Files:**

- Create: `vitest.config.ts`
- Create: `tests/config.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Rewrite: `src/config.ts`

**Interfaces:**

- Produces: `Config`, `CompleteConfig`, `DEFAULT_API_BASE_URL`, `loadConfig()`, `saveConfig()`, `isConfigComplete()`, `normalizeApiBaseUrl()`, `maskApiKey()`, `getConfigDir()`, `getConfigPath()`.
- Consumes: `ORGMORG_CONFIG_DIR` only as test/runtime override.

- [ ] **Step 1: Install test tools and define scripts**

Run:

```bash
npm install --save-dev vitest ink-testing-library
npm pkg set version=2.0.0
npm pkg set scripts.test='vitest run'
npm pkg set scripts.test:watch='vitest'
npm pkg set scripts.check='npm run build && npm test'
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
  },
})
```

Expected: `package-lock.json` records Vitest and ink-testing-library. Do not run the suite until Step 3, after the first test file exists.

- [ ] **Step 2: Write failing configuration tests**

Create `tests/config.test.ts`:

```ts
import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let configDir = ""

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-config-"))
  process.env.ORGMORG_CONFIG_DIR = configDir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.ORGMORG_CONFIG_DIR
  await fs.remove(configDir)
})

describe("config", () => {
  it("usa endpoint default y bloquea configuración incompleta", async () => {
    const { DEFAULT_API_BASE_URL, isConfigComplete, loadConfig } = await import("../src/config.js")
    const config = await loadConfig()
    expect(config).toMatchObject({ apiBaseUrl: DEFAULT_API_BASE_URL, basePath: null, apiKey: null })
    expect(isConfigComplete(config)).toBe(false)
  })

  it("normaliza HTTPS y solo permite HTTP loopback", async () => {
    const { normalizeApiBaseUrl } = await import("../src/config.js")
    expect(normalizeApiBaseUrl("https://admin-api.or-gm.com/")).toBe("https://admin-api.or-gm.com")
    expect(normalizeApiBaseUrl("http://localhost:8000/")).toBe("http://localhost:8000")
    expect(() => normalizeApiBaseUrl("http://admin-api.or-gm.com")).toThrow("HTTPS")
  })

  it("guarda secreto con permisos restrictivos y lo enmascara", async () => {
    const { getConfigDir, getConfigPath, maskApiKey, saveConfig } = await import("../src/config.js")
    await saveConfig({
      apiBaseUrl: "https://admin-api.or-gm.com",
      basePath: "/tmp/proyectos",
      apiKey: "orgm_1234567890abcdef",
    })
    expect(JSON.parse(await fs.readFile(getConfigPath(), "utf8"))).toMatchObject({
      apiKey: "orgm_1234567890abcdef",
    })
    expect((await fs.stat(getConfigDir())).mode & 0o777).toBe(0o700)
    expect((await fs.stat(getConfigPath())).mode & 0o777).toBe(0o600)
    expect(maskApiKey("orgm_1234567890abcdef")).toBe("orgm_1234…")
  })
})
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL because `Config` still exposes `dbPath/path` and new exports do not exist.

- [ ] **Step 4: Rewrite configuration module minimally**

Replace `src/config.ts` with implementation following this exact public shape:

```ts
import fs from "fs-extra"
import os from "node:os"
import path from "node:path"

export const DEFAULT_API_BASE_URL = "https://admin-api.or-gm.com"

export interface Config {
  apiBaseUrl: string
  basePath: string | null
  apiKey: string | null
  // Puente temporal para que código legacy compile hasta Task 6.
  dbPath?: string
  path?: string | null
}

export interface CompleteConfig extends Config {
  basePath: string
  apiKey: string
}

const DEFAULT_CONFIG: Config = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  basePath: null,
  apiKey: null,
}

export function getConfigDir(): string {
  return process.env.ORGMORG_CONFIG_DIR || path.join(os.homedir(), ".config", "orgmorg")
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json")
}

export function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value.trim())
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("El endpoint debe usar HTTPS; HTTP solo se permite para loopback.")
  }
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

function normalizeConfig(raw: unknown): Config {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  let apiBaseUrl = DEFAULT_API_BASE_URL
  if (typeof value.apiBaseUrl === "string" && value.apiBaseUrl.trim()) {
    try { apiBaseUrl = normalizeApiBaseUrl(value.apiBaseUrl) } catch { apiBaseUrl = DEFAULT_API_BASE_URL }
  }
  return {
    apiBaseUrl,
    basePath: typeof value.basePath === "string" && value.basePath.trim() ? path.resolve(value.basePath) : null,
    apiKey: typeof value.apiKey === "string" && value.apiKey.startsWith("orgm_") ? value.apiKey : null,
    dbPath: typeof value.dbPath === "string" && value.dbPath.trim() ? value.dbPath : undefined,
    path: typeof value.path === "string" && value.path.trim() ? value.path : null,
  }
}

export function isConfigComplete(config: Config): config is CompleteConfig {
  return Boolean(config.apiBaseUrl && config.basePath && config.apiKey?.startsWith("orgm_"))
}

export function maskApiKey(apiKey: string | null): string {
  return apiKey ? `${apiKey.slice(0, 9)}…` : "Sin configurar"
}

export async function loadConfig(): Promise<Config> {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(getConfigPath(), "utf8")))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { ...DEFAULT_CONFIG }
    throw error
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const normalized = normalizeConfig(config)
  await fs.ensureDir(getConfigDir(), { mode: 0o700 })
  await fs.chmod(getConfigDir(), 0o700)
  await fs.writeFile(getConfigPath(), JSON.stringify(normalized, null, 2), { encoding: "utf8", mode: 0o600 })
  await fs.chmod(getConfigPath(), 0o600)
}
```

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm test -- tests/config.test.ts
npm run build
```

Expected: configuration tests and build PASS. `dbPath/path` sobreviven únicamente como propiedades opcionales de transición; Task 6 elimina ese puente junto con sus consumidores.

- [ ] **Step 6: Commit configuration foundation**

```bash
git add package.json package-lock.json vitest.config.ts src/config.ts tests/config.test.ts
git commit -m "feat: add secure admin API configuration"
```

---

### Task 2: Authenticated Admin API Client

**Files:**

- Create: `src/admin-api.ts`
- Create: `tests/admin-api.test.ts`

**Interfaces:**

- Consumes: `AdminApiConfig` (`apiBaseUrl` + `apiKey`); `CompleteConfig` es compatible estructuralmente.
- Produces: `AdminApiClient`, `AdminApiError`, `AuthIdentity`, `QuotationSearchResult`, `validateCredentials()`, `searchQuotationsByProjectName()`, `downloadQuotationPdf()`.

```ts
export interface QuotationSearchResult {
  id: number
  projectId: number
  projectName: string
  date: string
  status: string
  description: string
}

export interface AdminApiConfig {
  apiBaseUrl: string
  apiKey: string
}

export class AdminApiClient {
  constructor(config: AdminApiConfig, dependencies?: AdminApiDependencies)
  validateCredentials(): Promise<AuthIdentity>
  searchQuotationsByProjectName(query: string): Promise<QuotationSearchResult[]>
  downloadQuotationPdf(quotationId: number, destination: string): Promise<void>
}
```

- [ ] **Step 1: Write failing API contract tests**

Create `tests/admin-api.test.ts` with deterministic fetch responses:

```ts
import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminApiClient, AdminApiError } from "../src/admin-api.js"

const config = {
  apiBaseUrl: "https://admin-api.or-gm.com",
  basePath: "/tmp/proyectos",
  apiKey: "orgm_test_key",
}

const temporary: string[] = []
afterEach(async () => Promise.all(temporary.splice(0).map((item) => fs.remove(item))))

describe("AdminApiClient", () => {
  it("valida API key con Bearer", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer orgm_test_key")
      return Response.json({ email: "osmar@or-gm.com", tenant_id: 1, exp: null, permisos: {} })
    })
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
    await expect(client.validateCredentials()).resolves.toMatchObject({ tenantId: 1 })
  })

  it("deduplica proyectos, filtra solo por nombre y ordena ID descendente", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/cotizaciones/search") {
        expect(url.searchParams.get("q")).toBe("torre")
        return Response.json([
          { id: 10, id_proyecto: 4, fecha: "2026-01-01", estado: "GENERADA", descripcion: "A" },
          { id: 12, id_proyecto: 4, fecha: "2026-02-01", estado: "APROBADA", descripcion: "B" },
          { id: 11, id_proyecto: 9, fecha: "2026-03-01", estado: "GENERADA", descripcion: "Cliente Torre" },
        ])
      }
      if (url.pathname === "/api/proyectos/4") return Response.json({ id: 4, nombre_proyecto: "Tórre Central" })
      if (url.pathname === "/api/proyectos/9") return Response.json({ id: 9, nombre_proyecto: "Nave Industrial" })
      throw new Error(`URL inesperada: ${url}`)
    })
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
    await expect(client.searchQuotationsByProjectName("torre")).resolves.toEqual([
      expect.objectContaining({ id: 12, projectName: "Tórre Central" }),
      expect.objectContaining({ id: 10, projectName: "Tórre Central" }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("rechaza respuesta no PDF y no deja destino", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-pdf-"))
    temporary.push(dir)
    const destination = path.join(dir, "quote.tmp")
    const client = new AdminApiClient(config, {
      fetch: async () => new Response("error", { headers: { "content-type": "text/html" } }),
      sleep: async () => {},
    })
    await expect(client.downloadQuotationPdf(593, destination)).rejects.toBeInstanceOf(AdminApiError)
    await expect(fs.pathExists(destination)).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
npm test -- tests/admin-api.test.ts
```

Expected: FAIL because `src/admin-api.ts` does not exist.

- [ ] **Step 3: Implement types, URL handling and error mapping**

Create `src/admin-api.ts`. Include these exact error categories and mappings:

```ts
export type AdminApiErrorKind = "auth" | "permission" | "not-found" | "transient" | "invalid-response"

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly kind: AdminApiErrorKind,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "AdminApiError"
  }
}

function errorForStatus(status: number): AdminApiError {
  if (status === 401) return new AdminApiError("API key inválida o revocada.", "auth", status)
  if (status === 403) return new AdminApiError("La API key no tiene el permiso requerido.", "permission", status)
  if (status === 404) return new AdminApiError("El recurso solicitado no existe.", "not-found", status)
  if (status === 429 || status >= 500) return new AdminApiError(`Error temporal del servidor (${status}).`, "transient", status)
  return new AdminApiError(`La API respondió HTTP ${status}.`, "invalid-response", status)
}
```

Define dependencies for deterministic tests:

```ts
export interface AdminApiDependencies {
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

const RETRY_DELAYS = [500, 1500] as const
const normalizeText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es")
```

- [ ] **Step 4: Implement request retries and public methods**

Implementation rules:

```ts
private async request(pathname: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      const response = await this.fetch(new URL(pathname, `${this.config.apiBaseUrl}/`), {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) return response
      const mapped = errorForStatus(response.status)
      if (mapped.kind !== "transient" || attempt === RETRY_DELAYS.length) throw mapped
      lastError = mapped
    } catch (error) {
      if (error instanceof AdminApiError && error.kind !== "transient") throw error
      lastError = error
      if (attempt === RETRY_DELAYS.length) break
    }
    await this.sleep(RETRY_DELAYS[attempt])
  }
  throw lastError instanceof AdminApiError
    ? lastError
    : new AdminApiError("No fue posible conectar con el sistema administrativo.", "transient")
}
```

Public methods must:

- map `/auth/me` to `{ email, tenantId, expiresAt, permissions }`;
- reject empty search before HTTP;
- call `/api/cotizaciones/search?q=...`;
- fetch each unique `/api/proyectos/{id}` once;
- filter normalized `nombre_proyecto` by normalized query;
- sort descending by `id`;
- require `application/pdf`, write with mode `0600`, and remove destination after any failure.

- [ ] **Step 5: Add retry/error assertions**

Extend test file:

```ts
it("reintenta 429 con pausas exactas", async () => {
  const sleep = vi.fn(async () => {})
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response("busy", { status: 429 }))
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ email: "a@b.com", tenant_id: 1, exp: null, permisos: {} }))
  const client = new AdminApiClient(config, { fetch: fetchMock, sleep })
  await client.validateCredentials()
  expect(sleep.mock.calls).toEqual([[500], [1500]])
})

it("no reintenta 403", async () => {
  const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }))
  const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
  await expect(client.validateCredentials()).rejects.toMatchObject({ kind: "permission" })
  expect(fetchMock).toHaveBeenCalledOnce()
})
```

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/admin-api.test.ts
npm run build
git add src/admin-api.ts tests/admin-api.test.ts
git commit -m "feat: add authenticated quotation API client"
```

Expected: focused tests and build PASS.

---

### Task 3: Transactional Project Folder Service

**Files:**

- Create: `src/services/project-folders.ts`
- Create: `tests/project-folders.test.ts`

**Interfaces:**

- Consumes: `QuotationSearchResult` and a download callback `(destination: string) => Promise<void>`.
- Produces: `sanitizeProjectName()`, `getQuotationFolderPreview()`, `syncQuotationFolder()`.

```ts
export interface QuotationFolderPreview {
  folderName: string
  targetDir: string
  offerDir: string
  pdfPath: string
}

export interface SyncQuotationFolderInput {
  basePath: string
  quotation: QuotationSearchResult
  downloadPdf: (destination: string) => Promise<void>
  templateDir?: string
}
```

- [ ] **Step 1: Write failing folder tests**

Create `tests/project-folders.test.ts`:

```ts
import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { getQuotationFolderPreview, sanitizeProjectName, syncQuotationFolder } from "../src/services/project-folders.js"

const roots: string[] = []
const makeRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-folders-"))
  roots.push(root)
  return root
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.remove(root))))

const quotation = { id: 593, projectId: 8, projectName: "Torre / Central", date: "2026-01-01", status: "GENERADA", description: "" }

describe("project folders", () => {
  it("sanea nombre y calcula destino", () => {
    expect(sanitizeProjectName(" CON: Torre / Central. ")).toBe("CON- Torre - Central")
    expect(getQuotationFolderPreview("/proyectos", quotation).folderName).toBe("593 - Torre - Central")
  })

  it("crea estructura nueva y PDF sin gitkeep", async () => {
    const root = await makeRoot()
    const template = path.join(root, "template")
    const basePath = path.join(root, "projects")
    await fs.ensureDir(path.join(template, "Oferta"))
    await fs.ensureDir(path.join(template, "Planos"))
    await fs.writeFile(path.join(template, "Oferta", ".gitkeep"), "")
    const result = await syncQuotationFolder({
      basePath,
      quotation,
      templateDir: template,
      downloadPdf: async (destination) => fs.writeFile(destination, "%PDF-test"),
    })
    expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-test")
    expect(await fs.pathExists(path.join(result.targetDir, "Planos"))).toBe(true)
    expect(await fs.pathExists(path.join(result.targetDir, "Oferta", ".gitkeep"))).toBe(false)
  })

  it("completa existente sin borrar archivos y reemplaza PDF", async () => {
    const root = await makeRoot()
    const template = path.join(root, "template")
    const basePath = path.join(root, "projects")
    const preview = getQuotationFolderPreview(basePath, quotation)
    await fs.ensureDir(path.join(template, "Oferta"))
    await fs.ensureDir(path.join(template, "Memorias"))
    await fs.ensureDir(preview.offerDir)
    await fs.writeFile(path.join(preview.targetDir, "usuario.txt"), "conservar")
    await fs.writeFile(preview.pdfPath, "viejo")
    await syncQuotationFolder({
      basePath,
      quotation,
      templateDir: template,
      downloadPdf: async (destination) => fs.writeFile(destination, "nuevo"),
    })
    expect(await fs.readFile(path.join(preview.targetDir, "usuario.txt"), "utf8")).toBe("conservar")
    expect(await fs.readFile(preview.pdfPath, "utf8")).toBe("nuevo")
    expect(await fs.pathExists(path.join(preview.targetDir, "Memorias"))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
npm test -- tests/project-folders.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement sane names and template traversal**

Use these exact rules:

```ts
const INVALID = /[<>:"/\\|?*\u0000-\u001F]+/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export function sanitizeProjectName(value: string): string {
  let result = value.normalize("NFKC").replace(INVALID, "-").replace(/\s+/g, " ").trim()
  result = result.replace(/[. ]+$/g, "").slice(0, 120).replace(/[. ]+$/g, "")
  if (!result) result = "PROYECTO"
  if (WINDOWS_RESERVED.test(result)) result = `_${result}`
  return result
}
```

Implement recursive directory-only copy with `fs.readdir(source, { withFileTypes: true })`; call `fs.ensureDir()` only for entries where `entry.isDirectory()`.

- [ ] **Step 4: Implement new/existing transaction paths**

Resolve package template from `import.meta.url`, but permit `templateDir` injection. Use `randomUUID()` for sibling temporary names.

Required cleanup pattern:

```ts
const pdfTemp = path.join(basePath, `.orgmorg-pdf-${quotation.id}-${randomUUID()}.tmp`)
const folderTemp = path.join(basePath, `.orgmorg-folder-${quotation.id}-${randomUUID()}.tmp`)
try {
  await fs.ensureDir(basePath)
  await downloadPdf(pdfTemp)
  if (await fs.pathExists(preview.targetDir)) {
    await createTemplateDirectories(templateDir, preview.targetDir)
    await fs.ensureDir(preview.offerDir)
    await replaceFileSafely(pdfTemp, preview.pdfPath)
  } else {
    await createTemplateDirectories(templateDir, folderTemp)
    await fs.ensureDir(path.join(folderTemp, "Oferta"))
    await fs.rename(pdfTemp, path.join(folderTemp, "Oferta", `cotizacion_${quotation.id}.pdf`))
    await fs.rename(folderTemp, preview.targetDir)
  }
  return preview
} finally {
  await fs.remove(pdfTemp)
  await fs.remove(folderTemp)
}
```

Implement safe replacement exactly:

```ts
async function replaceFileSafely(source: string, destination: string): Promise<void> {
  const backup = `${destination}.backup-${randomUUID()}`
  const hadDestination = await fs.pathExists(destination)
  if (hadDestination) await fs.rename(destination, backup)
  try {
    await fs.rename(source, destination)
    if (hadDestination) await fs.remove(backup)
  } catch (error) {
    await fs.remove(destination)
    if (hadDestination && await fs.pathExists(backup)) {
      await fs.rename(backup, destination)
    }
    throw error
  }
}
```

Never remove unrelated files.

- [ ] **Step 5: Add failure cleanup test**

```ts
it("no deja carpeta final ni temporales si descarga falla", async () => {
  const root = await makeRoot()
  const template = path.join(root, "template")
  const basePath = path.join(root, "projects")
  await fs.ensureDir(path.join(template, "Oferta"))
  await expect(syncQuotationFolder({
    basePath,
    quotation,
    templateDir: template,
    downloadPdf: async () => { throw new Error("red caída") },
  })).rejects.toThrow("red caída")
  expect(await fs.readdir(basePath)).toEqual([])
})
```

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/project-folders.test.ts
npm run build
git add src/services/project-folders.ts tests/project-folders.test.ts
git commit -m "feat: create quotation folders transactionally"
```

Expected: PASS.

---

### Task 4: Configuration Screens

**Files:**

- Modify: `src/cli/ui/screens/ConfiguracionesMenuScreen.tsx`
- Rewrite: `src/cli/ui/screens/ConfigValueScreen.tsx`
- Create: `src/cli/ui/screens/ApiKeyScreen.tsx`
- Create: `tests/settings-ui.test.tsx`

**Interfaces:**

- Consumes: Task 1 config functions and Task 2 `AdminApiClient.validateCredentials()`.
- Produces screen IDs: `config-api-url`, `config-base-path`, `config-api-key`.

- [ ] **Step 1: Write failing menu and secret tests**

Create `tests/settings-ui.test.tsx`:

```tsx
import React from "react"
import { render } from "ink-testing-library"
import { describe, expect, it, vi } from "vitest"
import { ConfiguracionesMenuScreen } from "../src/cli/ui/screens/ConfiguracionesMenuScreen.js"
import { ApiKeyScreen } from "../src/cli/ui/screens/ApiKeyScreen.js"

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

describe("settings UI", () => {
  it("muestra solo las tres configuraciones nuevas", () => {
    const { lastFrame } = render(<ConfiguracionesMenuScreen onSelect={() => {}} onBack={() => {}} />)
    expect(lastFrame()).toContain("Endpoint administrativo")
    expect(lastFrame()).toContain("Carpeta base")
    expect(lastFrame()).toContain("API key")
    expect(lastFrame()).not.toContain("base de datos")
  })

  it("oculta key y guarda solo después de validarla", async () => {
    const saveConfig = vi.fn(async () => {})
    const validateCredentials = vi.fn(async () => ({ email: "osmar@or-gm.com", tenantId: 1, expiresAt: null, permissions: {} }))
    const { stdin, lastFrame } = render(
      <ApiKeyScreen
        onBack={() => {}}
        loadConfig={async () => ({ apiBaseUrl: "https://admin-api.or-gm.com", basePath: "/tmp", apiKey: null })}
        saveConfig={saveConfig}
        validateCredentials={validateCredentials}
      />
    )
    await wait()
    stdin.write("orgm_super_secret")
    expect(lastFrame()).not.toContain("orgm_super_secret")
    stdin.write("\r")
    await wait()
    expect(validateCredentials).toHaveBeenCalledOnce()
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "orgm_super_secret" }))
  })
})
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
npm test -- tests/settings-ui.test.tsx
```

Expected: FAIL because menu labels are old and `ApiKeyScreen` is missing.

- [ ] **Step 3: Update settings menu and generic value screen**

Set menu items exactly:

```ts
const OPTIONS = [
  { id: "config-api-url", label: "Endpoint administrativo" },
  { id: "config-base-path", label: "Carpeta base" },
  { id: "config-api-key", label: "API key" },
]
```

`ConfigValueScreen` accepts `configKey: "apiBaseUrl" | "basePath"`. On submit:

- endpoint: call `normalizeApiBaseUrl()`;
- base path: `path.resolve()`, `fs.ensureDir()`, then verify write access with `fs.access(dir, fs.constants.W_OK)`;
- preserve other config values;
- save and show normalized value.

- [ ] **Step 4: Implement hidden API key validation screen**

`ApiKeyScreen` props must allow dependency injection:

```ts
interface ApiKeyScreenProps {
  onBack: () => void
  loadConfig?: typeof loadConfig
  saveConfig?: typeof saveConfig
  validateCredentials?: (config: AdminApiConfig) => Promise<AuthIdentity>
}
```

Render `TextInput` with `mask="*"`. Reject values not starting `orgm_`. Build `{ apiBaseUrl, apiKey }`, validate through injected callback or `new AdminApiClient(credentials).validateCredentials()`, then persist the key in the full `Config`. `basePath` may still be pending because it is not required by `/auth/me`. Error text must use mapped API error and never interpolate key.

- [ ] **Step 5: Run UI tests and build**

```bash
npm test -- tests/settings-ui.test.tsx
npm run build
```

Expected: PASS; no secret appears in frame.

- [ ] **Step 6: Commit settings flow**

```bash
git add src/cli/ui/screens/ConfiguracionesMenuScreen.tsx src/cli/ui/screens/ConfigValueScreen.tsx src/cli/ui/screens/ApiKeyScreen.tsx tests/settings-ui.test.tsx
git commit -m "feat: add admin API settings screens"
```

---

### Task 5: Search, Select and Create Screen

**Files:**

- Create: `src/cli/ui/screens/SearchQuotationScreen.tsx`
- Create: `tests/search-ui.test.tsx`

**Interfaces:**

- Consumes: `loadConfig`, `isConfigComplete`, `AdminApiClient`, `getQuotationFolderPreview`, `syncQuotationFolder`.
- Produces: `SearchQuotationScreen({ onBack, onConfigure, dependencies? })`.

```ts
interface SearchScreenDependencies {
  loadConfig: typeof loadConfig
  search: (config: CompleteConfig, query: string) => Promise<QuotationSearchResult[]>
  preview: typeof getQuotationFolderPreview
  sync: (config: CompleteConfig, quotation: QuotationSearchResult) => Promise<QuotationFolderPreview>
}
```

- [ ] **Step 1: Write failing happy-path UI test**

Create `tests/search-ui.test.tsx`:

```tsx
import React from "react"
import { render } from "ink-testing-library"
import { describe, expect, it, vi } from "vitest"
import { SearchQuotationScreen } from "../src/cli/ui/screens/SearchQuotationScreen.js"

const waitForText = async (frame: () => string | undefined, text: string) => {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (frame()?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`No apareció: ${text}`)
}

it("busca, selecciona, confirma y crea una carpeta", async () => {
  const sync = vi.fn(async () => ({
    folderName: "593 - Torre Central",
    targetDir: "/projects/593 - Torre Central",
    offerDir: "/projects/593 - Torre Central/Oferta",
    pdfPath: "/projects/593 - Torre Central/Oferta/cotizacion_593.pdf",
  }))
  const dependencies = {
    loadConfig: async () => ({ apiBaseUrl: "https://admin-api.or-gm.com", basePath: "/projects", apiKey: "orgm_test" }),
    search: async () => [{ id: 593, projectId: 8, projectName: "Torre Central", date: "2026-07-01", status: "GENERADA", description: "Diseño" }],
    preview: () => ({ folderName: "593 - Torre Central", targetDir: "/projects/593 - Torre Central", offerDir: "/projects/593 - Torre Central/Oferta", pdfPath: "/projects/593 - Torre Central/Oferta/cotizacion_593.pdf" }),
    sync,
  }
  const { stdin, lastFrame } = render(<SearchQuotationScreen onBack={() => {}} onConfigure={() => {}} dependencies={dependencies} />)
  await waitForText(lastFrame, "Nombre del proyecto")
  stdin.write("torre")
  stdin.write("\r")
  await waitForText(lastFrame, "593")
  await new Promise((resolve) => setTimeout(resolve, 60))
  stdin.write("\r")
  await waitForText(lastFrame, "Confirmar")
  await new Promise((resolve) => setTimeout(resolve, 60))
  stdin.write("\r")
  await waitForText(lastFrame, "Carpeta lista")
  expect(sync).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Add incomplete-config and cancel tests**

```tsx
it("dirige a configuración cuando falta un valor", async () => {
  const onConfigure = vi.fn()
  const { stdin, lastFrame } = render(
    <SearchQuotationScreen
      onBack={() => {}}
      onConfigure={onConfigure}
      dependencies={{
        loadConfig: async () => ({ apiBaseUrl: "https://admin-api.or-gm.com", basePath: null, apiKey: null }),
        search: vi.fn(), preview: vi.fn(), sync: vi.fn(),
      }}
    />
  )
  await waitForText(lastFrame, "Configuración incompleta")
  stdin.write("\r")
  expect(onConfigure).toHaveBeenCalledOnce()
})
```

- [ ] **Step 3: Run tests and confirm RED**

```bash
npm test -- tests/search-ui.test.tsx
```

Expected: FAIL because screen does not exist.

- [ ] **Step 4: Implement finite screen phases**

Use exact phase union:

```ts
type Phase =
  | "loading-config"
  | "config-error"
  | "query"
  | "searching"
  | "results"
  | "confirm"
  | "creating"
  | "done"
  | "error"
```

Rules:

- load configuration once on mount;
- disable `useInput` while searching/creating;
- query submit trims and rejects empty input locally;
- results use `SelectList`, one item per quotation, label `#<id> · <projectName> · <date> · <status>`;
- Enter from results opens confirmation; it must not create immediately;
- confirmation has `Sí, crear o actualizar carpeta` and `Cancelar`;
- Escape returns one phase at a time;
- creating calls default sync with `client.downloadQuotationPdf(id, destination)`;
- done displays target and PDF paths;
- errors display only safe `error.message`.

Use early returns in `useInput` and a 50 ms readiness buffer when entering result/confirm phases to prevent Enter propagating into next screen.

- [ ] **Step 5: Run focused tests and build**

```bash
npm test -- tests/search-ui.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit search workflow**

```bash
git add src/cli/ui/screens/SearchQuotationScreen.tsx tests/search-ui.test.tsx
git commit -m "feat: add quotation search and folder workflow"
```

---

### Task 6: Minimal App, CLI and Legacy Removal

**Files:**

- Modify: `src/cli/ui/App.tsx`
- Modify: `src/cli/ui/types.ts`
- Modify: `src/cli/ui/screens/MainMenuScreen.tsx`
- Modify: `src/cli/runMenu.tsx`
- Rewrite: `src/index.ts`
- Create: `tests/cli.test.ts`
- Delete all files/directories listed in “File Structure → Eliminar”.
- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Final `ScreenType`: `"main-menu" | "search-quotation" | "settings-menu" | "config-api-url" | "config-base-path" | "config-api-key"`.
- CLI accepted actions: no args/menu, help flags, version flags.

- [ ] **Step 1: Write failing CLI behavior test**

Create `tests/cli.test.ts`:

```ts
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { beforeAll, describe, expect, it } from "vitest"

const exec = promisify(execFile)

beforeAll(async () => {
  await exec("npm", ["run", "build"])
})

describe("CLI mínimo", () => {
  it("muestra ayuda nueva", async () => {
    const { stdout } = await exec(process.execPath, ["dist/index.js", "--help"])
    expect(stdout).toContain("Buscar cotizaciones por nombre de proyecto")
    expect(stdout).not.toContain("organize")
    expect(stdout).not.toContain("db seed")
  })

  it("rechaza comando retirado", async () => {
    await expect(exec(process.execPath, ["dist/index.js", "db", "seed"])).rejects.toMatchObject({
      stderr: expect.stringContaining("Comando no reconocido"),
    })
  })
})
```

- [ ] **Step 2: Reduce menu and navigation**

`MainMenuScreen` options:

```ts
const OPTIONS = [
  { id: "search-quotation", label: "Buscar cotización" },
  { id: "settings-menu", label: "Configuración" },
  { id: "exit", label: "Salir" },
]
```

`App.tsx` switch only renders:

- main menu;
- `SearchQuotationScreen`;
- `ConfiguracionesMenuScreen`;
- two `ConfigValueScreen` variants;
- `ApiKeyScreen`.

`SearchQuotationScreen.onConfigure` navigates to `settings-menu`. Remove direct `process.exit(0)`; call Ink `exit()` once.

- [ ] **Step 3: Rewrite CLI entry**

Replace command dispatcher with this behavior:

```ts
#!/usr/bin/env node
import { runMenu } from "./cli/runMenu.js"
import { CLI_VERSION } from "./version.js"

const [command] = process.argv.slice(2)

const HELP = `orgmorg v${CLI_VERSION}
Buscar cotizaciones por nombre de proyecto y crear sus carpetas.

Uso:
  orgmorg
  orgmorg menu
  orgmorg --help
  orgmorg --version
`

async function main(): Promise<void> {
  if (["help", "-h", "--help"].includes(command ?? "")) {
    process.stdout.write(HELP)
    return
  }
  if (["version", "-v", "--version"].includes(command ?? "")) {
    process.stdout.write(`${CLI_VERSION}\n`)
    return
  }
  if (command && command !== "menu") {
    process.stderr.write(`Comando no reconocido: ${command}\nUsa orgmorg --help.\n`)
    process.exitCode = 1
    return
  }
  if (!process.stdin.isTTY) {
    process.stderr.write("El menú interactivo requiere una terminal TTY.\n")
    process.exitCode = 1
    return
  }
  await runMenu()
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
```

Update `runMenu()` render options to `{ exitOnCtrlC: false, patchConsole: false }`.

- [ ] **Step 4: Delete retired implementation and datasets**

Run exact removals:

```bash
rm -f src/bootstrap-mapping.ts src/config-cmd.ts src/db-cmd.ts src/db-init.ts src/db.ts src/import.ts src/organize.ts src/organize-by-date.ts src/project.ts src/schema-sqlite.ts src/services/cotizaciones.ts src/cli/ui/utils/captureConsoleOutput.ts
rm -f src/cli/ui/screens/ConfigPathScreen.tsx src/cli/ui/screens/ConsultarMenuScreen.tsx src/cli/ui/screens/CrearProyectoScreen.tsx src/cli/ui/screens/EditarProyectoScreen.tsx src/cli/ui/screens/ListarProyectosScreen.tsx src/cli/ui/screens/OrganizeByDateMenuScreen.tsx src/cli/ui/screens/OrganizeByDateScreen.tsx src/cli/ui/screens/OrganizeByTypeScreen.tsx src/cli/ui/screens/RecrearCarpetaScreen.tsx src/cli/ui/screens/UltimoNumeroScreen.tsx
rm -rf data exports schema
rm -f cotizaciones_proyctos.json
npm uninstall better-sqlite3 @types/better-sqlite3
```

Remove the transitional `dbPath` and `path` properties plus their normalization from `src/config.ts`, then search for stale references:

```bash
rg -n "better-sqlite3|dbPath|SQLite|organize|seed|CrearCotizacion|UltimoNumero|RecrearCarpeta" src package.json
```

Expected: no stale runtime references.

- [ ] **Step 5: Run CLI and full test suite**

```bash
npm run check
node dist/index.js --help
node dist/index.js --version
npm pack --dry-run
```

Expected:

- build PASS;
- all tests PASS;
- help contains only current scope;
- package tarball includes `dist/` and `template/`, not datasets or SQLite artifacts.

- [ ] **Step 6: Commit breaking cleanup**

```bash
git add -A
git commit -m "refactor!: remove legacy database and organizer features"
```

---

### Task 7: Final Integration Verification

**Files:**

- Create: `tests/workflow.integration.test.ts`
- Modify only files required by failures found in this task.

**Interfaces:**

- Verifies all prior tasks as one release candidate.

- [ ] **Step 1: Run project diagnostics before build**

```bash
npm run build
```

Additionally run `lsp_diagnostics` on `src/` and `lens_diagnostics mode=all`. Expected: zero blocking errors.

- [ ] **Step 2: Run complete automated verification**

```bash
npm test
npm run check
npm pack --dry-run
```

Expected: all commands exit 0; no production HTTP request occurs.

- [ ] **Step 3: Add and run a loopback integration test**

Create `tests/workflow.integration.test.ts`:

```ts
import fs from "fs-extra"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { AdminApiClient } from "../src/admin-api.js"
import { isConfigComplete, loadConfig, saveConfig } from "../src/config.js"
import { syncQuotationFolder } from "../src/services/project-folders.js"

const roots: string[] = []
afterEach(async () => {
  delete process.env.ORGMORG_CONFIG_DIR
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)))
})

describe("quotation workflow integration", () => {
  it("consulta loopback, crea carpeta y actualiza PDF sin borrar archivos", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-integration-"))
    roots.push(root)
    const templateDir = path.join(root, "template")
    const basePath = path.join(root, "projects")
    process.env.ORGMORG_CONFIG_DIR = path.join(root, "config")
    await fs.ensureDir(path.join(templateDir, "Oferta"))
    await fs.ensureDir(path.join(templateDir, "Planos"))

    let pdfBody = "%PDF-v1"
    const server = http.createServer((request, response) => {
      if (request.headers.authorization !== "Bearer orgm_test") {
        response.writeHead(401).end()
        return
      }
      if (request.url === "/auth/me") {
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ email: "test@or-gm.com", tenant_id: 1, exp: null, permisos: {} }))
        return
      }
      if (request.url === "/api/cotizaciones/search?q=torre") {
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify([{ id: 593, id_proyecto: 8, fecha: "2026-07-01", estado: "GENERADA", descripcion: "Diseño" }]))
        return
      }
      if (request.url === "/api/proyectos/8") {
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ id: 8, nombre_proyecto: "Torre Central" }))
        return
      }
      if (request.url === "/api/cotizaciones/593/pdf") {
        response.setHeader("content-type", "application/pdf")
        response.end(pdfBody)
        return
      }
      response.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

    try {
      const port = (server.address() as AddressInfo).port
      await saveConfig({ apiBaseUrl: `http://127.0.0.1:${port}`, basePath, apiKey: "orgm_test" })
      const config = await loadConfig()
      expect(isConfigComplete(config)).toBe(true)
      if (!isConfigComplete(config)) throw new Error("Configuración incompleta")

      const client = new AdminApiClient(config)
      await client.validateCredentials()
      const [quotation] = await client.searchQuotationsByProjectName("torre")
      const result = await syncQuotationFolder({
        basePath: config.basePath,
        quotation,
        templateDir,
        downloadPdf: (destination) => client.downloadQuotationPdf(quotation.id, destination),
      })
      expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-v1")

      await fs.writeFile(path.join(result.targetDir, "usuario.txt"), "conservar")
      pdfBody = "%PDF-v2"
      await syncQuotationFolder({
        basePath: config.basePath,
        quotation,
        templateDir,
        downloadPdf: (destination) => client.downloadQuotationPdf(quotation.id, destination),
      })
      expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-v2")
      expect(await fs.readFile(path.join(result.targetDir, "usuario.txt"), "utf8")).toBe("conservar")
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
```

Run:

```bash
npm test -- tests/workflow.integration.test.ts
```

Expected: PASS; no request leaves loopback.

- [ ] **Step 4: Verify removed surface**

```bash
rg -n "better-sqlite3|db seed|organize-by-date|Crear cotización|Editar proyecto" src package.json package-lock.json
find data exports schema -maxdepth 1 -print 2>/dev/null
```

Expected: no matches and no removed directories.

- [ ] **Step 5: Request code review**

Invoke `superpowers:requesting-code-review` against the complete diff. Fix every confirmed blocking issue, rerun Steps 1–4, then commit only if review produced changes:

```bash
git add -A
git commit -m "fix: address quotation workflow review"
```

## Plan Self-Review

- Spec coverage: configuration, API auth, exact endpoints, project-only filtering, one-result selection, safe folder merge, PDF validation, retries, permissions, UI removal and test isolation all map to Tasks 1–7.
- Placeholder scan: no `TBD`, `TODO`, “implement later” or undefined task references.
- Type consistency: `CompleteConfig`, `QuotationSearchResult`, `QuotationFolderPreview` and injected screen dependencies retain the same names across tasks.
- Scope: one cohesive application flow; no backend modification, OAuth flow, SQLite compatibility or bulk operation added.
