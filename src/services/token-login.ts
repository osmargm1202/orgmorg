import {
  AdminApiError,
  FUNCTIONAL_PERMISSIONS,
  hasPermissions,
  selectLeastPrivilegeRole,
  type AdminRole,
  type AuthIdentity,
} from "../admin-api.js"
import type { Config } from "../config.js"

const PROVISIONING_PERMISSIONS = [
  ["roles", "ver"],
  ["usuarios", "crear"],
] as const

const FUNCTIONAL_PERMISSION_LABEL =
  "cotizaciones:ver, proyectos:ver, cotizaciones:imprimir"

export interface TokenLoginClient {
  validateCredentials(): Promise<AuthIdentity>
  listRoles(): Promise<AdminRole[]>
  createApiKey(name: string, roleId: number): Promise<string>
}

export type TokenLoginSource =
  | "existing"
  | "environment-key"
  | "environment-jwt"
  | "browser-jwt"

export interface TokenLoginResult {
  apiKey: string
  email: string
  roleName: string | null
  source: TokenLoginSource
}

export interface ProvisionApiKeyInput {
  token: string
  source: Exclude<TokenLoginSource, "existing">
  createClient: (credential: string) => TokenLoginClient
}

export interface ObtainApiKeyInput {
  config: Config
  environmentToken: string | undefined
  createClient: (credential: string) => TokenLoginClient
}

function hasFunctionalPermissions(identity: AuthIdentity): boolean {
  return hasPermissions(identity.permissions, FUNCTIONAL_PERMISSIONS)
}

function assertFunctionalPermissions(identity: AuthIdentity): void {
  if (!hasFunctionalPermissions(identity)) {
    throw new Error(
      `La API key no tiene los permisos requeridos: ${FUNCTIONAL_PERMISSION_LABEL}.`
    )
  }
}

function assertProvisioningPermissions(identity: AuthIdentity): void {
  if (identity.isSuperadmin) return
  for (const [category, action] of PROVISIONING_PERMISSIONS) {
    if (!identity.permissions[category]?.includes(action)) {
      throw new Error(`ORGM_TOKEN no tiene el permiso ${category}:${action}.`)
    }
  }
}

async function tryExistingApiKey(
  config: Config,
  createClient: (credential: string) => TokenLoginClient
): Promise<TokenLoginResult | null> {
  if (!config.apiKey) return null
  try {
    const identity = await createClient(config.apiKey).validateCredentials()
    if (!hasFunctionalPermissions(identity)) return null
    return {
      apiKey: config.apiKey,
      email: identity.email,
      roleName: null,
      source: "existing",
    }
  } catch (error) {
    if (error instanceof AdminApiError && error.kind === "transient") throw error
    return null
  }
}

export async function provisionApiKeyFromToken(
  input: ProvisionApiKeyInput
): Promise<TokenLoginResult> {
  const token = input.token.trim()
  if (!token) throw new Error("La credencial temporal está vacía.")

  const tokenClient = input.createClient(token)
  const tokenIdentity = await tokenClient.validateCredentials()

  if (token.startsWith("orgm_")) {
    assertFunctionalPermissions(tokenIdentity)
    return {
      apiKey: token,
      email: tokenIdentity.email,
      roleName: null,
      source: input.source,
    }
  }

  assertProvisioningPermissions(tokenIdentity)
  const selectedRole = selectLeastPrivilegeRole(await tokenClient.listRoles())
  if (!selectedRole) {
    throw new Error(`No existe un rol compatible con: ${FUNCTIONAL_PERMISSION_LABEL}.`)
  }

  const apiKey = await tokenClient.createApiKey("orgmorg-cli", selectedRole.id)
  const finalIdentity = await input.createClient(apiKey).validateCredentials()
  assertFunctionalPermissions(finalIdentity)

  return {
    apiKey,
    email: finalIdentity.email,
    roleName: selectedRole.name,
    source: input.source,
  }
}

export async function obtainApiKeyFromEnvironment(
  input: ObtainApiKeyInput
): Promise<TokenLoginResult> {
  const existing = await tryExistingApiKey(input.config, input.createClient)
  if (existing) return existing

  const environmentToken = input.environmentToken?.trim()
  if (!environmentToken) {
    throw new Error("ORGM_TOKEN no está configurado en el entorno.")
  }

  return provisionApiKeyFromToken({
    token: environmentToken,
    source: environmentToken.startsWith("orgm_")
      ? "environment-key"
      : "environment-jwt",
    createClient: input.createClient,
  })
}
