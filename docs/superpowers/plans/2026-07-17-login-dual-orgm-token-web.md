# Login dual ORGM_TOKEN y callback web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ofrecer ORGM_TOKEN o login Google existente, aceptar JWT/callback pegado de forma oculta y guardar solo API key final.

**Architecture:** Un servicio puro construye la URL web y extrae `access_token`; el aprovisionamiento actual se generaliza para cualquier token temporal. Dos pantallas Ink separan selección de método y captura web sin modificar backend.

**Tech Stack:** TypeScript 5.7, Node 22, Ink 6, Vitest 4, paquete `open`.

## Global Constraints

- Modificar únicamente orgmorg.
- Usar worktree `/home/osmarg/Code/orgmorg/.worktrees/dual-login-web`.
- Login URL exacta: `<apiBaseUrl>/auth/google/start`.
- Aceptar JWT directo o URL con `access_token` en fragmento/query.
- JWT solo en memoria; limpiar entrada antes de red.
- Nunca mostrar, registrar o persistir JWT/callback pegado.
- Guardar solo API key final validada.
- Mantener ORGM_TOKEN, API key manual e `is_superadmin`.
- Pruebas sin Google ni producción.

---

### Task 1: Parser de callback y apertura web

**Files:**

- Create: `src/services/web-login.ts`
- Create: `tests/web-login.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: `buildWebLoginUrl(apiBaseUrl: string): string`.
- Produces: `extractAccessToken(value: string): string`.
- Produces: `launchWebLogin(apiBaseUrl, openBrowser?) -> Promise<{loginUrl, opened}>`.

- [ ] **Step 1: Install browser opener**

Run: `npm install open`.

- [ ] **Step 2: Write failing tests**

Create `tests/web-login.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import {
  buildWebLoginUrl,
  extractAccessToken,
  launchWebLogin,
} from "../src/services/web-login.js"

describe("web login", () => {
  it("construye login desde único endpoint configurado", () => {
    expect(buildWebLoginUrl("https://api.example.com/")).toBe(
      "https://api.example.com/auth/google/start"
    )
  })

  it.each([
    ["  jwt-directo  ", "jwt-directo"],
    ["https://admin.example/auth/callback#access_token=jwt-fragmento", "jwt-fragmento"],
    ["https://admin.example/auth/callback?access_token=jwt-query", "jwt-query"],
  ])("extrae token sin devolver entrada completa", (value, expected) => {
    expect(extractAccessToken(value)).toBe(expected)
  })

  it("rechaza vacío y callback sin token sin filtrar URL", () => {
    expect(() => extractAccessToken(" ")).toThrow("Pega el token")
    const callback = "https://admin.example/auth/callback#otro=secreto"
    expect(() => extractAccessToken(callback)).toThrow("access_token")
    try { extractAccessToken(callback) } catch (error) {
      expect(String(error)).not.toContain(callback)
    }
  })

  it("devuelve URL aunque navegador falle", async () => {
    const openBrowser = vi.fn(async () => { throw new Error("sin navegador") })
    await expect(launchWebLogin("https://api.example.com", openBrowser)).resolves.toEqual({
      loginUrl: "https://api.example.com/auth/google/start",
      opened: false,
    })
  })
})
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/web-login.test.ts`.  
Expected: FAIL because module does not exist.

- [ ] **Step 4: Implement service**

Create `src/services/web-login.ts`:

```ts
import open from "open"

export type OpenBrowser = (url: string) => Promise<void>

export function buildWebLoginUrl(apiBaseUrl: string): string {
  return new URL("/auth/google/start", `${apiBaseUrl.replace(/\/+$/, "")}/`).toString()
}

export function extractAccessToken(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("Pega el token o la URL del callback.")
  if (!trimmed.includes("://")) return trimmed
  let callback: URL
  try {
    callback = new URL(trimmed)
  } catch {
    throw new Error("La URL del callback no es válida.")
  }
  const fragment = new URLSearchParams(callback.hash.replace(/^#/, ""))
  const token = fragment.get("access_token") ?? callback.searchParams.get("access_token")
  if (!token?.trim()) throw new Error("El callback no contiene access_token.")
  return token.trim()
}

export async function launchWebLogin(
  apiBaseUrl: string,
  openBrowser: OpenBrowser = async (url) => { await open(url) }
): Promise<{ loginUrl: string; opened: boolean }> {
  const loginUrl = buildWebLoginUrl(apiBaseUrl)
  try {
    await openBrowser(loginUrl)
    return { loginUrl, opened: true }
  } catch {
    return { loginUrl, opened: false }
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/web-login.test.ts
npm run build
git add package.json package-lock.json src/services/web-login.ts tests/web-login.test.ts
git commit -m "feat: add existing web login helpers"
```

---

### Task 2: Aprovisionamiento genérico de API key

**Files:**

- Modify: `src/services/token-login.ts`
- Modify: `tests/token-login.test.ts`

**Interfaces:**

- Produces: `provisionApiKeyFromToken(input) -> Promise<TokenLoginResult>`.
- Extends source with `browser-jwt`.
- Preserves: `obtainApiKeyFromEnvironment` and existing-key reuse.

- [ ] **Step 1: Write failing test**

Add to `tests/token-login.test.ts`:

```ts
it("aprovisiona JWT pegado sin devolverlo", async () => {
  const jwtClient = client({
    validateCredentials: vi.fn(async () => identity({}, "admin@or-gm.com", true)),
    listRoles: vi.fn(async () => [
      { id: 4, name: "CLI", active: true, permissions: functionalPermissions },
    ]),
    createApiKey: vi.fn(async () => "orgm_web_created"),
  })
  const result = await provisionApiKeyFromToken({
    token: "jwt-web-secret",
    source: "browser-jwt",
    createClient: (credential) => credential === "orgm_web_created" ? client() : jwtClient,
  })
  expect(result).toMatchObject({ apiKey: "orgm_web_created", source: "browser-jwt" })
  expect(JSON.stringify(result)).not.toContain("jwt-web-secret")
})
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/token-login.test.ts`.  
Expected: FAIL because generic function/source do not exist.

- [ ] **Step 3: Extract generic function**

Define:

```ts
export type TokenLoginSource =
  | "existing"
  | "environment-key"
  | "environment-jwt"
  | "browser-jwt"

export interface ProvisionApiKeyInput {
  token: string
  source: Exclude<TokenLoginSource, "existing">
  createClient: (credential: string) => TokenLoginClient
}
```

Move direct-key/JWT branches into `provisionApiKeyFromToken`. Keep `tryExistingApiKey` in `obtainApiKeyFromEnvironment`, then delegate environment token with correct source. Preserve role selection, final validation and superadmin bypass unchanged.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/token-login.test.ts
npm run build
git add src/services/token-login.ts tests/token-login.test.ts
git commit -m "refactor: provision API key from temporary token"
```

---

### Task 3: Selector de método y login web Ink

**Files:**

- Create: `src/cli/ui/screens/AuthMethodScreen.tsx`
- Create: `src/cli/ui/screens/WebLoginScreen.tsx`
- Modify: `src/cli/ui/App.tsx`
- Modify: `src/cli/ui/types.ts`
- Modify: `src/cli/ui/screens/ConfiguracionesMenuScreen.tsx`
- Modify: `tests/settings-ui.test.tsx`

**Interfaces:**

- Routes: `config-auth-method`, `config-token-env`, `config-token-web`.
- `WebLoginScreen` consumes `launchWebLogin`, `extractAccessToken`, `provisionApiKeyFromToken`.

- [ ] **Step 1: Write failing UI tests**

Add imports and tests:

```tsx
it("ofrece ORGM_TOKEN y Google HTTPS", () => {
  const { lastFrame } = render(<AuthMethodScreen onSelect={() => {}} onBack={() => {}} />)
  expect(lastFrame()).toContain("Usar ORGM_TOKEN")
  expect(lastFrame()).toContain("Iniciar sesión con Google (HTTPS)")
})

it("abre web, oculta JWT y guarda solo API key", async () => {
  const saveConfig = vi.fn(async () => {})
  const launchLogin = vi.fn(async () => ({
    loginUrl: "https://api.example.com/auth/google/start",
    opened: true,
  }))
  const provision = vi.fn(async () => ({
    apiKey: "orgm_web_key",
    email: "osmar@or-gm.com",
    roleName: "CLI",
    source: "browser-jwt" as const,
  }))
  const { stdin, lastFrame } = render(
    <WebLoginScreen
      onBack={() => {}}
      loadConfig={async () => ({ apiBaseUrl: "https://api.example.com", basePath: "/tmp", apiKey: null })}
      saveConfig={saveConfig}
      launchLogin={launchLogin}
      provisionApiKey={provision}
    />
  )
  await waitForText(lastFrame, "Enter abrir Google")
  stdin.write("\r")
  await waitForText(lastFrame, "Pega el token")
  stdin.write("jwt-web-secret")
  expect(lastFrame()).not.toContain("jwt-web-secret")
  stdin.write("\r")
  await waitForText(lastFrame, "API key configurada")
  expect(provision).toHaveBeenCalledWith(expect.objectContaining({ token: "jwt-web-secret" }))
  expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "orgm_web_key" }))
  expect(lastFrame()).not.toContain("jwt-web-secret")
  expect(lastFrame()).not.toContain("orgm_web_key")
})
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/settings-ui.test.tsx`.  
Expected: FAIL because screens do not exist.

- [ ] **Step 3: Implement AuthMethodScreen**

Use `MenuScreen` with:

```ts
const METHODS = [
  { id: "config-token-env", label: "Usar ORGM_TOKEN" },
  { id: "config-token-web", label: "Iniciar sesión con Google (HTTPS)" },
]
```

Load and validate configured API key. Valid access shows one `Reconfigurar` item with email/key mask; selecting it reveals methods. Missing/invalid key shows methods directly.

- [ ] **Step 4: Implement WebLoginScreen**

State machine:

```ts
type Status = "loading" | "ready" | "opening" | "input" | "working" | "done" | "error"
```

Dependencies:

```ts
interface WebLoginScreenProps {
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  saveConfig?: typeof defaultSaveConfig
  launchLogin?: typeof launchWebLogin
  provisionApiKey?: typeof provisionApiKeyFromToken
}
```

Behavior:

1. load config and show configured endpoint;
2. Enter calls `launchLogin(apiBaseUrl)`;
3. show login URL and warning when `opened=false`;
4. render `TextInput mask="*"` for token/callback;
5. on submit call `extractAccessToken(value)`, then immediately `setValue("")`;
6. call `provisionApiKey` with source `browser-jwt` and `AdminApiClient` factory;
7. save only returned API key;
8. show email, role and `maskApiKey`;
9. errors never include input;
10. use stable input handling and disable Escape only while `working`.

- [ ] **Step 5: Wire routes**

Configuration item navigates to `config-auth-method`; selector navigates to existing `TokenLoginScreen` through `config-token-env` or new web screen through `config-token-web`. Keep API key manual unchanged.

- [ ] **Step 6: Add error/security tests**

Cover existing valid key guard, opener failure URL, callback URL extraction, empty input, invalid JWT, provisioning error, save failure and Escape. Every test asserts frames omit unique JWT/callback fixtures and failed flows do not call `saveConfig`.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- tests/settings-ui.test.tsx tests/web-login.test.ts tests/token-login.test.ts
npm run check
git add src/cli/ui tests/settings-ui.test.tsx
git commit -m "feat: add ORGM token and web login choices"
```

---

### Task 4: Integración y verificación final

**Files:**

- Modify: `tests/workflow.integration.test.ts`
- Modify: `docs/superpowers/specs/2026-07-17-login-dual-orgm-token-web-design.md`

- [ ] **Step 1: Add integration test**

Use injected browser/provisioning dependencies to execute selector → web input → API key save with real temporary config filesystem. Assert config contains final `orgm_` key and never JWT/callback.

- [ ] **Step 2: Run security searches**

```bash
rg -n "console\.(log|error)|JSON\.stringify\(.*token" src
rg -n "jwt-web-secret|access_token" src tests
```

Expected: no secret logging; token strings only in controlled parser/tests.

- [ ] **Step 3: Verify package**

```bash
npm run check
npm audit --audit-level=high
npm pack --dry-run
```

Expected: build/tests pass, no high/critical vulnerabilities, new screens/services included.

- [ ] **Step 4: Mark spec implemented and commit**

Change spec status to `implementado`, then:

```bash
git add tests/workflow.integration.test.ts docs/superpowers/specs/2026-07-17-login-dual-orgm-token-web-design.md
git commit -m "test: cover dual web login workflow"
```

- [ ] **Step 5: Request review**

Review secret handling, existing-key duplication guard, URL derivation, Ink input stability and no-production tests before merge.
