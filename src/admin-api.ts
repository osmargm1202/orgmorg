import fs from "fs-extra"
import path from "node:path"

export interface AdminApiConfig {
  apiBaseUrl: string
  apiKey: string
}

export interface AdminApiDependencies {
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

export type Permissions = Record<string, string[]>

export interface AuthIdentity {
  email: string
  tenantId: number
  expiresAt: number | null
  permissions: Permissions
  isSuperadmin: boolean
}

export interface AdminRole {
  id: number
  name: string
  active: boolean
  permissions: Permissions
}

export const FUNCTIONAL_PERMISSIONS = [
  ["cotizaciones", "ver"],
  ["proyectos", "ver"],
  ["cotizaciones", "imprimir"],
] as const

export function hasPermissions(
  permissions: Permissions,
  required: readonly (readonly [string, string])[]
): boolean {
  return required.every(([category, action]) => permissions[category]?.includes(action))
}

export function selectLeastPrivilegeRole(roles: AdminRole[]): AdminRole | null {
  const compatible = roles.filter(
    (role) => role.active && hasPermissions(role.permissions, FUNCTIONAL_PERMISSIONS)
  )
  compatible.sort((left, right) => {
    const leftCount = Object.values(left.permissions).reduce(
      (total, actions) => total + actions.length,
      0
    )
    const rightCount = Object.values(right.permissions).reduce(
      (total, actions) => total + actions.length,
      0
    )
    return leftCount - rightCount || left.id - right.id
  })
  return compatible[0] ?? null
}

export interface QuotationSearchResult {
  id: number
  projectId: number
  projectName: string
  date: string
  status: string
  description: string
}

export type AdminApiErrorKind =
  | "auth"
  | "permission"
  | "not-found"
  | "transient"
  | "invalid-response"

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly kind: AdminApiErrorKind,
    public readonly status?: number
  ) {
    super(message)
    this.name = "AdminApiError"
  }
}

interface AuthResponse {
  email?: unknown
  tenant_id?: unknown
  exp?: unknown
  permisos?: unknown
  is_superadmin?: unknown
}

interface QuotationResponse {
  id?: unknown
  id_proyecto?: unknown
  fecha?: unknown
  estado?: unknown
  descripcion?: unknown
}

interface ProjectResponse {
  id?: unknown
  nombre_proyecto?: unknown
}

interface RoleResponse {
  id?: unknown
  nombre?: unknown
  activo?: unknown
  permisos?: unknown
}

interface ApiKeyResponse {
  api_key?: unknown
}

const RETRY_DELAYS = [500, 1500] as const
const JSON_TIMEOUT_MS = 15_000
const PDF_TIMEOUT_MS = 120_000

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
}

function errorForStatus(status: number, requiredPermission?: string): AdminApiError {
  if (status === 401) {
    return new AdminApiError("API key inválida o revocada.", "auth", status)
  }
  if (status === 403) {
    const detail = requiredPermission ? ` ${requiredPermission}` : " requerido"
    return new AdminApiError(`La API key no tiene el permiso${detail}.`, "permission", status)
  }
  if (status === 404) {
    return new AdminApiError("El recurso solicitado no existe.", "not-found", status)
  }
  if (status === 429 || status >= 500) {
    return new AdminApiError(`Error temporal del servidor (${status}).`, "transient", status)
  }
  return new AdminApiError(`La API respondió HTTP ${status}.`, "invalid-response", status)
}

function asNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new AdminApiError(`La API devolvió un ${field} inválido.`, "invalid-response")
}

function asString(value: unknown, field: string): string {
  if (typeof value === "string") return value
  throw new AdminApiError(`La API devolvió un ${field} inválido.`, "invalid-response")
}

function normalizePermissions(value: unknown): Permissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const permissions: Permissions = {}
  for (const [category, actions] of Object.entries(value)) {
    if (Array.isArray(actions) && actions.every((action) => typeof action === "string")) {
      permissions[category] = actions
    }
  }
  return permissions
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new AdminApiError("La API devolvió JSON inválido.", "invalid-response")
  }
}

export class AdminApiClient {
  private readonly fetchRequest: typeof fetch
  private readonly wait: (milliseconds: number) => Promise<void>

  constructor(
    private readonly config: AdminApiConfig,
    dependencies: AdminApiDependencies = {}
  ) {
    this.fetchRequest = dependencies.fetch ?? globalThis.fetch
    this.wait = dependencies.sleep ?? sleep
  }

  private buildUrl(pathname: string): URL {
    return new URL(pathname, `${this.config.apiBaseUrl.replace(/\/+$/, "")}/`)
  }

  private async request(
    pathname: string,
    init: RequestInit = {},
    timeoutMs = JSON_TIMEOUT_MS,
    requiredPermission?: string
  ): Promise<Response> {
    let lastError: unknown
    const retryDelays = (init.method ?? "GET").toUpperCase() === "GET" ? RETRY_DELAYS : []

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const headers = new Headers(init.headers)
        headers.set("Authorization", `Bearer ${this.config.apiKey}`)
        const response = await this.fetchRequest(this.buildUrl(pathname), {
          ...init,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        })

        if (response.ok) return response

        throw errorForStatus(response.status, requiredPermission)
      } catch (error) {
        if (error instanceof AdminApiError && error.kind !== "transient") {
          throw error
        }
        lastError = error
        if (attempt === retryDelays.length) break
        await this.wait(retryDelays[attempt])
      }
    }

    if (lastError instanceof AdminApiError) throw lastError
    throw new AdminApiError(
      "No fue posible conectar con el sistema administrativo.",
      "transient"
    )
  }

  async validateCredentials(): Promise<AuthIdentity> {
    const payload = (await parseJson(await this.request("/auth/me"))) as AuthResponse
    const permissions = normalizePermissions(payload.permisos)

    return {
      email: asString(payload.email, "email"),
      tenantId: asNumber(payload.tenant_id, "tenant_id"),
      expiresAt: typeof payload.exp === "number" ? payload.exp : null,
      permissions,
      isSuperadmin: payload.is_superadmin === true,
    }
  }

  async searchQuotationsByProjectName(query: string): Promise<QuotationSearchResult[]> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      throw new AdminApiError(
        "Escribe un nombre de proyecto para buscar.",
        "invalid-response"
      )
    }

    const searchUrl = new URL("/api/cotizaciones/search", this.config.apiBaseUrl)
    searchUrl.searchParams.set("q", trimmedQuery)
    const rawQuotations = await parseJson(
      await this.request(
        `${searchUrl.pathname}${searchUrl.search}`,
        {},
        JSON_TIMEOUT_MS,
        "cotizaciones:ver"
      )
    )
    if (!Array.isArray(rawQuotations)) {
      throw new AdminApiError(
        "La API devolvió una lista de cotizaciones inválida.",
        "invalid-response"
      )
    }

    const quotations = rawQuotations.map((raw) => {
      const item = raw as QuotationResponse
      return {
        id: asNumber(item.id, "id de cotización"),
        projectId: asNumber(item.id_proyecto, "id_proyecto"),
        date: asString(item.fecha, "fecha"),
        status: asString(item.estado, "estado"),
        description: typeof item.descripcion === "string" ? item.descripcion : "",
      }
    })

    const projectIds = [...new Set(quotations.map((quotation) => quotation.projectId))]
    const projectEntries = await Promise.all(
      projectIds.map(async (projectId) => {
        const payload = (await parseJson(
          await this.request(
            `/api/proyectos/${projectId}`,
            {},
            JSON_TIMEOUT_MS,
            "proyectos:ver"
          )
        )) as ProjectResponse
        return [projectId, asString(payload.nombre_proyecto, "nombre_proyecto")] as const
      })
    )
    const projects = new Map(projectEntries)
    const normalizedQuery = normalizeText(trimmedQuery)

    return quotations
      .map((quotation) => ({
        ...quotation,
        projectName: projects.get(quotation.projectId) ?? "",
      }))
      .filter((quotation) => normalizeText(quotation.projectName).includes(normalizedQuery))
      .sort((left, right) => right.id - left.id)
  }

  async listRoles(): Promise<AdminRole[]> {
    const payload = await parseJson(
      await this.request("/api/roles", {}, JSON_TIMEOUT_MS, "roles:ver")
    )
    if (!Array.isArray(payload)) {
      throw new AdminApiError("La API devolvió roles inválidos.", "invalid-response")
    }
    return payload.map((raw) => {
      const role = raw as RoleResponse
      if (typeof role.activo !== "boolean") {
        throw new AdminApiError("La API devolvió un estado de rol inválido.", "invalid-response")
      }
      return {
        id: asNumber(role.id, "id de rol"),
        name: asString(role.nombre, "nombre de rol"),
        active: role.activo,
        permissions: normalizePermissions(role.permisos),
      }
    })
  }

  async createApiKey(name: string, roleId: number): Promise<string> {
    const payload = (await parseJson(
      await this.request(
        "/api/apikeys",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: name, rol_id: roleId }),
        },
        JSON_TIMEOUT_MS,
        "usuarios:crear"
      )
    )) as ApiKeyResponse
    const apiKey = asString(payload.api_key, "api_key")
    if (!apiKey.startsWith("orgm_")) {
      throw new AdminApiError("La API devolvió una API key inválida.", "invalid-response")
    }
    return apiKey
  }

  async downloadQuotationPdf(quotationId: number, destination: string): Promise<void> {
    try {
      const response = await this.request(
        `/api/cotizaciones/${quotationId}/pdf`,
        {},
        PDF_TIMEOUT_MS,
        "cotizaciones:imprimir"
      )
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
      if (!contentType.startsWith("application/pdf")) {
        throw new AdminApiError(
          "La API no devolvió un archivo PDF válido.",
          "invalid-response"
        )
      }

      await fs.ensureDir(path.dirname(destination))
      await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()), {
        mode: 0o600,
        flag: "wx",
      })
    } catch (error) {
      await fs.remove(destination)
      throw error
    }
  }
}
