import { describe, expect, it, vi } from "vitest"
import { type AuthIdentity } from "../src/admin-api.js"
import {
  obtainApiKeyFromEnvironment,
  provisionApiKeyFromToken,
  type TokenLoginClient,
} from "../src/services/token-login.js"

const functionalPermissions = {
  cotizaciones: ["ver", "imprimir"],
  proyectos: ["ver"],
}

const identity = (
  permissions: Record<string, string[]>,
  email = "osmar@or-gm.com",
  isSuperadmin = false
): AuthIdentity => ({ email, tenantId: 1, expiresAt: null, permissions, isSuperadmin })

const client = (overrides: Partial<TokenLoginClient> = {}): TokenLoginClient => ({
  validateCredentials: vi.fn(async () => identity(functionalPermissions)),
  listRoles: vi.fn(async () => []),
  createRole: vi.fn(async () => ({
    id: 4,
    name: "orgmorg-cli-read-only",
    active: true,
    permissions: functionalPermissions,
  })),
  createApiKey: vi.fn(async () => "orgm_created"),
  ...overrides,
})

const config = {
  apiBaseUrl: "https://admin-api.or-gm.com",
  basePath: "/tmp/projects",
  apiKey: null,
}

describe("obtainApiKeyFromEnvironment", () => {
  it("reutiliza key configurada válida sin crear duplicado", async () => {
    const existing = client()
    const createClient = vi.fn(() => existing)
    await expect(
      obtainApiKeyFromEnvironment({
        config: { ...config, apiKey: "orgm_existing" },
        environmentToken: "jwt_ignored",
        createClient,
      })
    ).resolves.toMatchObject({ apiKey: "orgm_existing", source: "existing" })
    expect(existing.listRoles).not.toHaveBeenCalled()
    expect(existing.createApiKey).not.toHaveBeenCalled()
  })

  it("aprovisiona una API key restringida desde ORGM_TOKEN API key", async () => {
    const environment = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver", "crear"], usuarios: ["crear"] })
      ),
    })
    const generated = client()
    const createClient = vi.fn((credential: string) =>
      credential === "orgm_created" ? generated : environment
    )
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "orgm_environment",
        createClient,
      })
    ).resolves.toMatchObject({
      apiKey: "orgm_created",
      source: "environment-key",
      roleName: "orgmorg-cli-read-only",
    })
    expect(environment.createRole).toHaveBeenCalledWith("orgmorg-cli-read-only", functionalPermissions)
    expect(environment.createApiKey).toHaveBeenCalledWith("orgmorg-cli", 4)
  })

  it("crea un rol restringido para JWT aunque exista un rol compatible más amplio", async () => {
    const jwtClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver", "crear"], usuarios: ["crear"] })
      ),
      listRoles: vi.fn(async () => [
        {
          id: 9,
          name: "Admin",
          active: true,
          permissions: {
            cotizaciones: ["ver", "imprimir", "crear"],
            proyectos: ["ver"],
          },
        },
        {
          id: 4,
          name: "CLI",
          active: true,
          permissions: functionalPermissions,
        },
      ]),
      createApiKey: vi.fn(async () => "orgm_created"),
    })
    const createdClient = client()
    const createClient = vi.fn((credential: string) =>
      credential === "jwt_access" ? jwtClient : createdClient
    )

    await expect(
      obtainApiKeyFromEnvironment({ config, environmentToken: "jwt_access", createClient })
    ).resolves.toEqual({
      apiKey: "orgm_created",
      email: "osmar@or-gm.com",
      roleName: "orgmorg-cli-read-only",
      source: "environment-jwt",
    })
    expect(jwtClient.createRole).toHaveBeenCalledWith("orgmorg-cli-read-only", functionalPermissions)
    expect(jwtClient.createApiKey).toHaveBeenCalledWith("orgmorg-cli", 4)
  })

  it("falla sin ORGM_TOKEN y no crea cliente", async () => {
    const createClient = vi.fn()
    await expect(
      obtainApiKeyFromEnvironment({ config, environmentToken: undefined, createClient })
    ).rejects.toThrow("ORGM_TOKEN no está configurado")
    expect(createClient).not.toHaveBeenCalled()
  })

  it("reutiliza una API key configurada válida antes de ORGM_TOKEN", async () => {
    const configured = client({
      validateCredentials: vi.fn(async () =>
        identity({
          cotizaciones: ["ver", "imprimir", "crear"],
          proyectos: ["ver"],
          roles: ["ver", "crear"],
          usuarios: ["crear"],
        })
      ),
    })
    const createClient = vi.fn(() => configured)
    await expect(
      obtainApiKeyFromEnvironment({
        config: { ...config, apiKey: "orgm_configured" },
        environmentToken: "orgm_environment",
        createClient,
      })
    ).resolves.toMatchObject({
      apiKey: "orgm_configured",
      source: "existing",
      roleName: null,
    })
    expect(configured.listRoles).not.toHaveBeenCalled()
    expect(configured.createApiKey).not.toHaveBeenCalled()
  })

  it("permite aprovisionamiento con JWT superadmin aunque permisos estén vacíos", async () => {
    const jwtClient = client({
      validateCredentials: vi.fn(async () => identity({}, "admin@or-gm.com", true)),
      listRoles: vi.fn(async () => [
        { id: 4, name: "CLI", active: true, permissions: functionalPermissions },
      ]),
      createApiKey: vi.fn(async () => "orgm_created"),
    })
    const finalClient = client()
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "jwt_superadmin",
        createClient: (credential) =>
          credential === "orgm_created" ? finalClient : jwtClient,
      })
    ).resolves.toMatchObject({ source: "environment-jwt", roleName: "orgmorg-cli-read-only" })
  })

  it("rechaza JWT sin permisos de aprovisionamiento", async () => {
    const jwtClient = client({
      validateCredentials: vi.fn(async () => identity({ roles: ["ver"] })),
    })
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "jwt_access",
        createClient: () => jwtClient,
      })
    ).rejects.toThrow("roles:crear")
    expect(jwtClient.listRoles).not.toHaveBeenCalled()
  })

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
      createClient: (credential) =>
        credential === "orgm_web_created" ? client() : jwtClient,
    })
    expect(result).toMatchObject({ apiKey: "orgm_web_created", source: "browser-jwt" })
    expect(JSON.stringify(result)).not.toContain("jwt-web-secret")
  })

  it("rechaza un rol dedicado inválido y una API key final sin permisos", async () => {
    const invalidRoleClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver", "crear"], usuarios: ["crear"] })
      ),
      createRole: vi.fn(async () => ({
        id: 1,
        name: "orgmorg-cli-read-only",
        active: true,
        permissions: { cotizaciones: ["ver"] },
      })),
    })
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "jwt_invalid_role",
        createClient: () => invalidRoleClient,
      })
    ).rejects.toThrow("rol orgmorg-cli-read-only con permisos inválidos")

    const jwtClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver", "crear"], usuarios: ["crear"] })
      ),
      listRoles: vi.fn(async () => [
        {
          id: 4,
          name: "orgmorg-cli-read-only",
          active: true,
          permissions: functionalPermissions,
        },
      ]),
    })
    const invalidCreated = client({
      validateCredentials: vi.fn(async () => identity({ cotizaciones: ["ver"] })),
    })
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "jwt_access",
        createClient: (credential) =>
          credential === "orgm_created" ? invalidCreated : jwtClient,
      })
    ).rejects.toThrow("API key no tiene los permisos requeridos")
  })
})
