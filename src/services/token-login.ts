import {
  AdminApiError,
  FUNCTIONAL_PERMISSIONS,
  hasPermissions,
  type AdminRole,
  type AuthIdentity,
  type Permissions,
} from "../admin-api.js"
import type { Config } from "../config.js"

const PROVISIONING_PERMISSIONS = [
  ["roles", "ver"],
  ["roles", "crear"],
  ["usuarios", "crear"],
] as const

const RESTRICTED_ROLE_NAME = "orgmorg-cli-read-only"
const RESTRICTED_ROLE_PERMISSIONS: Permissions = {
  cotizaciones: ["ver", "imprimir"],
  proyectos: ["ver"],
}

const FUNCTIONAL_PERMISSION_LABEL =
  "cotizaciones:ver, proyectos:ver, cotizaciones:imprimir"

export interface TokenLoginClient {
  validateCredentials(): Promise<AuthIdentity>
  listRoles(): Promise<AdminRole[]>
  createRole(name: string, permissions: Permissions): Promise<AdminRole>
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

function hasExactPermissions(actual: Permissions, expected: Permissions): boolean {
  const expectedEntries = Object.entries(expected)
  return (
    Object.keys(actual).length === expectedEntries.length &&
    expectedEntries.every(
      ([category, actions]) =>
        actual[category]?.length === actions.length &&
        actions.every((action) => actual[category]?.includes(action))
    )
  )
}

async function ensureRestrictedRole(client: TokenLoginClient): Promise<AdminRole> {
  const roles = await client.listRoles()
  const namedRole = roles.find((role) => role.active && role.name === RESTRICTED_ROLE_NAME)
  if (namedRole) {
    if (!hasExactPermissions(namedRole.permissions, RESTRICTED_ROLE_PERMISSIONS)) {
      throw new Error(
        `El rol ${RESTRICTED_ROLE_NAME} debe tener únicamente los permisos requeridos.`
      )
    }
    return namedRole
  }

  const createdRole = await client.createRole(RESTRICTED_ROLE_NAME, RESTRICTED_ROLE_PERMISSIONS)
  if (!createdRole.active || !hasExactPermissions(createdRole.permissions, RESTRICTED_ROLE_PERMISSIONS)) {
    throw new Error(`La API creó un rol ${RESTRICTED_ROLE_NAME} con permisos inválidos.`)
  }
  return createdRole
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

  assertProvisioningPermissions(tokenIdentity)
  const selectedRole = await ensureRestrictedRole(tokenClient)
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
