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

export interface AuthIdentity {
  email: string
  tenantId: number
  expiresAt: number | null
  permissions: Record<string, unknown>
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

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
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
        if (attempt === RETRY_DELAYS.length) break
        await this.wait(RETRY_DELAYS[attempt])
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
    const permissions =
      payload.permisos && typeof payload.permisos === "object"
        ? (payload.permisos as Record<string, unknown>)
        : {}

    return {
      email: asString(payload.email, "email"),
      tenantId: asNumber(payload.tenant_id, "tenant_id"),
      expiresAt: typeof payload.exp === "number" ? payload.exp : null,
      permissions,
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
