import { describe, expect, it, vi } from "vitest"
import { AdminApiError, type AuthIdentity } from "../src/admin-api.js"
import { obtainApiKeyFromEnvironment, type TokenLoginClient } from "../src/services/token-login.js"

const functionalPermissions = {
  cotizaciones: ["ver", "imprimir"],
  proyectos: ["ver"],
}

const identity = (
  permissions: Record<string, string[]>,
  email = "osmar@or-gm.com"
): AuthIdentity => ({ email, tenantId: 1, expiresAt: null, permissions })

const client = (overrides: Partial<TokenLoginClient> = {}): TokenLoginClient => ({
  validateCredentials: vi.fn(async () => identity(functionalPermissions)),
  listRoles: vi.fn(async () => []),
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

  it("valida y devuelve ORGM_TOKEN que ya es API key", async () => {
    const environment = client()
    const createClient = vi.fn(() => environment)
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "orgm_environment",
        createClient,
      })
    ).resolves.toMatchObject({
      apiKey: "orgm_environment",
      source: "environment-key",
      roleName: null,
    })
  })

  it("usa JWT, elige rol mínimo, crea y valida API key", async () => {
    const jwtClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver"], usuarios: ["crear"] })
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
      roleName: "CLI",
      source: "environment-jwt",
    })
    expect(jwtClient.createApiKey).toHaveBeenCalledWith("orgmorg-cli", 4)
  })

  it("falla sin ORGM_TOKEN y no crea cliente", async () => {
    const createClient = vi.fn()
    await expect(
      obtainApiKeyFromEnvironment({ config, environmentToken: undefined, createClient })
    ).rejects.toThrow("ORGM_TOKEN no está configurado")
    expect(createClient).not.toHaveBeenCalled()
  })

  it("continúa con token de entorno si key configurada es inválida", async () => {
    const invalid = client({
      validateCredentials: vi.fn(async () => {
        throw new AdminApiError("revocada", "auth", 401)
      }),
    })
    const environment = client()
    const createClient = vi.fn((credential: string) =>
      credential === "orgm_invalid" ? invalid : environment
    )
    await expect(
      obtainApiKeyFromEnvironment({
        config: { ...config, apiKey: "orgm_invalid" },
        environmentToken: "orgm_environment",
        createClient,
      })
    ).resolves.toMatchObject({ source: "environment-key" })
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
    ).rejects.toThrow("usuarios:crear")
    expect(jwtClient.listRoles).not.toHaveBeenCalled()
  })

  it("rechaza ausencia de rol compatible y key final sin permisos", async () => {
    const noRoleClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver"], usuarios: ["crear"] })
      ),
      listRoles: vi.fn(async () => [
        { id: 1, name: "Lector", active: true, permissions: { cotizaciones: ["ver"] } },
      ]),
    })
    await expect(
      obtainApiKeyFromEnvironment({
        config,
        environmentToken: "jwt_no_role",
        createClient: () => noRoleClient,
      })
    ).rejects.toThrow("cotizaciones:ver, proyectos:ver, cotizaciones:imprimir")

    const jwtClient = client({
      validateCredentials: vi.fn(async () =>
        identity({ roles: ["ver"], usuarios: ["crear"] })
      ),
      listRoles: vi.fn(async () => [
        { id: 4, name: "CLI", active: true, permissions: functionalPermissions },
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
