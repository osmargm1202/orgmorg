# ORGM_TOKEN Login and ORGMorg Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar obtención automática de API key desde `ORGM_TOKEN` y corregir título visible a `ORGMorg`.

**Architecture:** Extender `AdminApiClient` con roles/creación de keys, mantener selección de rol como función pura y encapsular orquestación en `token-login.ts`. Pantalla Ink solo presenta estado y delega lógica, con dependencias inyectables para pruebas sin producción.

**Tech Stack:** TypeScript, Node.js Fetch API, React 19, Ink 6, Vitest, ink-testing-library.

## Global Constraints

- No modificar backend/frontend administrativo.
- JWT solo vive en memoria; nunca persistirlo ni mostrarlo.
- API key final requiere `cotizaciones:ver`, `proyectos:ver`, `cotizaciones:imprimir`.
- JWT requiere `roles:ver` y `usuarios:crear`.
- Rol elegido: compatible activo con menor total de acciones; desempate por ID ascendente.
- API key existente válida evita duplicado.
- Configuración anterior no cambia hasta validar key final.
- Entrada manual permanece disponible.
- Título exacto: `ORGMorg`; ninguna referencia visible a `ORGMcalc`.
- Pruebas no llaman producción.

---

### Task 1: Roles, Permissions and API Key Creation

**Files:**

- Modify: `src/admin-api.ts`
- Modify: `tests/admin-api.test.ts`

**Interfaces:**

```ts
export interface AdminRole {
  id: number
  name: string
  active: boolean
  permissions: Record<string, string[]>
}

export const FUNCTIONAL_PERMISSIONS = [
  ["cotizaciones", "ver"],
  ["proyectos", "ver"],
  ["cotizaciones", "imprimir"],
] as const

export function hasPermissions(
  permissions: Record<string, string[]>,
  required: readonly (readonly [string, string])[],
): boolean

export function selectLeastPrivilegeRole(roles: AdminRole[]): AdminRole | null
```

`AdminApiClient` produce:

```ts
listRoles(): Promise<AdminRole[]>
createApiKey(name: string, roleId: number): Promise<string>
```

- [ ] **Step 1: Write failing tests**

Add tests that:

```ts
expect(selectLeastPrivilegeRole([
  { id: 9, name: "Admin", active: true, permissions: { cotizaciones: ["ver", "imprimir", "crear"], proyectos: ["ver"], usuarios: ["ver"] } },
  { id: 4, name: "CLI", active: true, permissions: { cotizaciones: ["ver", "imprimir"], proyectos: ["ver"] } },
  { id: 2, name: "Inactivo", active: false, permissions: { cotizaciones: ["ver", "imprimir"], proyectos: ["ver"] } },
])).toMatchObject({ id: 4 })
```

Test tie by lower ID, `GET /api/roles`, `POST /api/apikeys` body `{nombre:"orgmorg-cli", rol_id:4}`, 403 messages `roles:ver`/`usuarios:crear`, and invalid response without `api_key`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/admin-api.test.ts
```

Expected: missing exports/methods.

- [ ] **Step 3: Implement minimal API support**

Map backend fields `nombre`, `activo`, `permisos` to `AdminRole`. Count privileges with:

```ts
const permissionCount = (role: AdminRole) =>
  Object.values(role.permissions).reduce((total, actions) => total + actions.length, 0)
```

Sort compatible roles by count then ID. `createApiKey()` sends JSON content type and rejects absent/invalid `api_key` as `invalid-response`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- tests/admin-api.test.ts
npm run build
git add src/admin-api.ts tests/admin-api.test.ts
git commit -m "feat: add API key role provisioning"
```

---

### Task 2: ORGM_TOKEN Acquisition Service

**Files:**

- Create: `src/services/token-login.ts`
- Create: `tests/token-login.test.ts`

**Interfaces:**

```ts
export interface TokenLoginClient {
  validateCredentials(): Promise<AuthIdentity>
  listRoles(): Promise<AdminRole[]>
  createApiKey(name: string, roleId: number): Promise<string>
}

export interface TokenLoginResult {
  apiKey: string
  email: string
  roleName: string | null
  source: "existing" | "environment-key" | "environment-jwt"
}

export async function obtainApiKeyFromEnvironment(input: {
  config: Config
  environmentToken: string | undefined
  createClient: (credential: string) => TokenLoginClient
}): Promise<TokenLoginResult>
```

- [ ] **Step 1: Write failing orchestration tests**

Cover:

1. configured valid key with permissions returns `existing`, never reads/provisions roles;
2. `orgm_` environment key validates permissions and returns `environment-key`;
3. JWT checks `roles:ver`/`usuarios:crear`, chooses least role, creates `orgmorg-cli`, validates new key and returns `environment-jwt`;
4. missing token throws `ORGM_TOKEN no está configurado`;
5. no compatible role throws required functional permissions;
6. invalid existing key falls through to environment token;
7. key final without permissions throws and does not return success.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/token-login.test.ts
```

- [ ] **Step 3: Implement service**

Use `hasPermissions()` for functional and JWT provisioning permissions. Never include credential values in errors. Do not save configuration in this service; return validated result only.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/token-login.test.ts
npm run build
git add src/services/token-login.ts tests/token-login.test.ts
git commit -m "feat: obtain API key from ORGM token"
```

---

### Task 3: Login Screen, Navigation and Title

**Files:**

- Create: `src/cli/ui/screens/TokenLoginScreen.tsx`
- Modify: `src/cli/ui/screens/ConfiguracionesMenuScreen.tsx`
- Modify: `src/cli/ui/App.tsx`
- Modify: `src/cli/ui/types.ts`
- Modify: `src/cli/ui/components/AppShell.tsx`
- Modify: `tests/settings-ui.test.tsx`

**Screen ID:** `config-token-login`.

- [ ] **Step 1: Write failing UI tests**

Assert:

```tsx
expect(settingsFrame).toContain("Iniciar sesión / Obtener API key")
expect(appShellFrame).toContain("ORGMorg")
expect(appShellFrame).not.toContain("ORGMcalc")
```

For `TokenLoginScreen`, inject `readEnvironmentToken`, `obtainApiKey`, `loadConfig`, `saveConfig`. Assert Enter starts operation, successful result saves only returned `apiKey`, frame shows masked prefix but neither environment token nor full key. Error path does not call `saveConfig`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/settings-ui.test.tsx
```

- [ ] **Step 3: Implement UI**

Menu order:

```ts
[
  { id: "config-token-login", label: "Iniciar sesión / Obtener API key" },
  { id: "config-api-url", label: "Endpoint administrativo" },
  { id: "config-base-path", label: "Carpeta base" },
  { id: "config-api-key", label: "API key manual" },
]
```

Screen states: `loading | ready | working | done | error`. On Enter call service; only after success save `{...config, apiKey: result.apiKey}`. Default environment reader is `() => process.env.ORGM_TOKEN`.

App navigation adds `config-token-login`. AppShell renders exact contiguous text `ORGMorg`.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/settings-ui.test.tsx
npm run build
git add src/cli/ui tests/settings-ui.test.tsx
git commit -m "feat: add ORGM token login screen"
```

---

### Task 4: Final Verification

**Files:**

- Modify only if verification reveals a confirmed defect.

- [ ] **Step 1: Run diagnostics and suite**

```bash
npm run check
npm audit --omit=dev --audit-level=high
```

- [ ] **Step 2: Verify secrets/title/surface**

```bash
rg -n "ORGMcalc" src tests
rg -n "ORGM_TOKEN" src
npm pack --dry-run
```

Expected: no ORGMcalc; ORGM_TOKEN appears only environment reader/messages; package clean.

- [ ] **Step 3: Review complete diff**

Review against `docs/superpowers/specs/2026-07-17-orgm-token-login-title-design.md`. Fix Critical/Important findings with failing tests first.

- [ ] **Step 4: Final commit only if review changed code**

```bash
git add -A
git commit -m "fix: address ORGM token login review"
```

## Plan Self-Review

- Every spec requirement maps to Tasks 1–4.
- JWT persistence is structurally excluded because service returns only validated API key.
- Role selection and orchestration remain testable outside Ink.
- Existing manual API key flow remains untouched.
- No placeholders or backend changes.
