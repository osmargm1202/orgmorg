import { canOpenBrowserAutomatically, rehydrateSession, runOAuthLogin } from "./auth/neon.js"
import { loadConfig, loadSession, saveSession, type Config, type StoredSession } from "./config.js"

export type DataApiErrorKind =
  | "session-expired"
  | "auth"
  | "permissions"
  | "config"
  | "unknown"

export class DataApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
    public readonly kind: DataApiErrorKind = "unknown",
    public readonly resource?: string
  ) {
    super(message)
    this.name = "DataApiError"
  }
}

export interface AuthenticatedContext {
  config: Config
  session: StoredSession
}

interface AuthenticatedContextOptions {
  allowReauth?: boolean
  resource?: string
}

interface AuthenticatedContextResolution {
  context: AuthenticatedContext
  reauthenticated: boolean
}

type ReauthReason = "missing" | "expired" | "rejected"

let reauthenticationPromise: Promise<StoredSession> | null = null

function normalizeEpochMs(value: number | null | undefined): number | null {
  if (value == null) return null
  return value > 10_000_000_000 ? value : value * 1000
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return Buffer.from(padded, "base64").toString("utf-8")
}

function getAccessTokenExpiryMs(accessToken: string): number | null {
  try {
    const [, payload] = accessToken.split(".")
    if (!payload) return null
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown }
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null
  } catch {
    return null
  }
}

export function hasSessionToken(session: StoredSession): boolean {
  return typeof session.sessionToken === "string" && session.sessionToken.trim().length > 0
}

export function hasCachedAccessToken(session: StoredSession): boolean {
  return typeof session.accessToken === "string" && session.accessToken.trim().length > 0
}

export function isLegacySession(session: StoredSession): boolean {
  return !hasSessionToken(session) && hasCachedAccessToken(session)
}

export function getEffectiveSessionExpiry(session: StoredSession): number | null {
  const candidates = [
    normalizeEpochMs(session.expiresAt),
    hasCachedAccessToken(session) ? getAccessTokenExpiryMs(session.accessToken as string) : null,
  ].filter((value): value is number => value != null)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

export function isSessionExpired(session: StoredSession): boolean {
  if (!hasCachedAccessToken(session)) return true
  const expiresAtMs = getEffectiveSessionExpiry(session)
  if (expiresAtMs == null) return false
  return Date.now() >= expiresAtMs
}

function buildInteractiveLoginHint(reason: ReauthReason, resource?: string): string {
  const resourceHint = resource ? ` para consultar ${resource}` : ""
  switch (reason) {
    case "missing":
      return `No hay sesión activa${resourceHint} y el comando se está ejecutando en modo no interactivo. Ejecuta \`orgmorg login\` en una terminal interactiva y vuelve a intentar.`
    case "expired":
      return `El JWT cacheado ya expiró${resourceHint} y el comando se está ejecutando en modo no interactivo. Ejecuta \`orgmorg login\` en una terminal interactiva y vuelve a intentar.`
    default:
      return `Neon rechazó el JWT actual${resourceHint}, pero el comando se está ejecutando en modo no interactivo. Ejecuta \`orgmorg login\` en una terminal interactiva y vuelve a intentar.`
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function persistRehydratedSession(
  config: Config,
  currentSession: StoredSession
): Promise<StoredSession> {
  const hydratedSession = await rehydrateSession(config.authUrl, currentSession)
  await saveSession(hydratedSession)
  return hydratedSession
}

async function reauthenticateSession(
  config: Config,
  reason: ReauthReason,
  resource?: string,
  currentSession?: StoredSession
): Promise<StoredSession> {
  const rehydrateCandidate = reason === "missing" ? null : currentSession ?? null

  if (!reauthenticationPromise) {
    // Serializa la recuperación de sesión para que múltiples requests compartan el mismo refresh/login.
    reauthenticationPromise = (async () => {
      if (rehydrateCandidate && hasSessionToken(rehydrateCandidate)) {
        try {
          return await persistRehydratedSession(config, rehydrateCandidate)
        } catch (error) {
          if (!canOpenBrowserAutomatically()) {
            throw new Error(
              `${buildInteractiveLoginHint(reason, resource)} Detalle de la rehidratación: ${toErrorMessage(error)}`
            )
          }
        }
      }

      if (!canOpenBrowserAutomatically()) {
        const legacyHint =
          rehydrateCandidate && isLegacySession(rehydrateCandidate)
            ? " La sesión local es legacy y no tiene session token para renovarse automáticamente."
            : ""
        throw new Error(`${buildInteractiveLoginHint(reason, resource)}${legacyHint}`)
      }

      return runOAuthLogin({
        allowBrowser: true,
        preferExistingBrowserSession: true,
      })
    })()
      .catch((error) => {
        throw new Error(`No se pudo reautenticar automáticamente. ${toErrorMessage(error)}`)
      })
      .finally(() => {
        reauthenticationPromise = null
      })
  }

  return reauthenticationPromise
}

async function resolveAuthenticatedContext(
  options: AuthenticatedContextOptions = {}
): Promise<AuthenticatedContextResolution> {
  const { allowReauth = false, resource } = options
  const [config, session] = await Promise.all([loadConfig(), loadSession()])
  if (!session) {
    if (!allowReauth) {
      throw new Error("No hay sesión activa. Ejecuta: orgmorg login")
    }
    return {
      context: {
        config,
        session: await reauthenticateSession(config, "missing", resource),
      },
      reauthenticated: true,
    }
  }
  if (!isSessionExpired(session)) {
    return {
      context: { config, session },
      reauthenticated: false,
    }
  }

  if (hasSessionToken(session)) {
    try {
      return {
        context: {
          config,
          session: await persistRehydratedSession(config, session),
        },
        reauthenticated: true,
      }
    } catch (error) {
      if (!allowReauth) {
        throw new Error(
          `El JWT cacheado expiró y no pudo rehidratarse desde Better Auth. Ejecuta: orgmorg login. Detalle: ${toErrorMessage(error)}`
        )
      }
    }
  }

  if (!allowReauth) {
    if (isLegacySession(session)) {
      throw new Error(
        "La sesión local solo tiene un JWT legacy y no puede rehidratarse automáticamente. Ejecuta: orgmorg login"
      )
    }

    throw new Error("La sesión guardada no puede rehidratarse automáticamente. Ejecuta: orgmorg login")
  }

  return {
    context: {
      config,
      session: await reauthenticateSession(config, "expired", resource, session),
    },
    reauthenticated: true,
  }
}

export async function getAuthenticatedContext(
  options: AuthenticatedContextOptions = {}
): Promise<AuthenticatedContext> {
  return (await resolveAuthenticatedContext(options)).context
}

type Primitive = string | number | boolean

type SearchValue =
  | Primitive
  | null
  | undefined
  | Primitive[]
  | Record<string, Primitive | null | undefined>

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  searchParams?: Record<string, SearchValue>
  body?: unknown
  headers?: Record<string, string>
}

export function isLikelyRestApiUrl(url: string): boolean {
  try {
    return /\/rest\/v1\/?$/.test(new URL(url).pathname)
  } catch {
    return /\/rest\/v1\/?$/.test(url)
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

function appendSearch(url: URL, searchParams: Record<string, SearchValue>): void {
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(","))
      continue
    }
    if (typeof value === "object") {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue == null) continue
        url.searchParams.set(`${key}.${subKey}`, String(subValue))
      }
      continue
    }
    url.searchParams.set(key, String(value))
  }
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function stringifyParsed(parsed: unknown): string {
  if (typeof parsed === "string") return parsed
  if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed)
  return ""
}

function getParsedMessage(parsed: unknown): string | null {
  if (typeof parsed === "string") {
    return parsed.trim() || null
  }
  if (typeof parsed === "object" && parsed !== null) {
    for (const key of ["message", "error", "hint", "details"]) {
      if (key in parsed && typeof parsed[key as keyof typeof parsed] === "string") {
        const value = parsed[key as keyof typeof parsed] as string
        if (value.trim()) return value
      }
    }
  }
  return null
}

function isExpiredTokenResponse(status: number, parsed: unknown): boolean {
  if (![400, 401].includes(status)) return false
  const text = stringifyParsed(parsed)
  return /jwt.+expired|token has expired|session.+expired/i.test(text)
}

function classifyDataApiError(status: number, parsed: unknown): DataApiErrorKind {
  if (isExpiredTokenResponse(status, parsed)) {
    return "session-expired"
  }

  const text = stringifyParsed(parsed).toLowerCase()
  if (status === 401 || text.includes("invalid token") || text.includes("bearer")) {
    return "auth"
  }
  if (
    status === 403 ||
    text.includes("permission denied") ||
    text.includes("row-level security") ||
    text.includes("rls") ||
    text.includes("42501")
  ) {
    return "permissions"
  }
  if (
    status === 404 ||
    text.includes("relation") ||
    text.includes("schema") ||
    text.includes("column") ||
    text.includes("does not exist") ||
    text.includes("not found") ||
    text.includes("pgrst")
  ) {
    return "config"
  }
  return "unknown"
}

function buildDataApiErrorMessage(
  kind: DataApiErrorKind,
  status: number,
  resource: string,
  parsed: unknown
): string {
  const parsedMessage = getParsedMessage(parsed)
  const suffix = parsedMessage ? ` Detalle: ${parsedMessage}` : ""

  switch (kind) {
    case "session-expired":
      return `El JWT usado contra Neon Data API ya venció al consultar ${resource}. El CLI intentará renovarlo desde la sesión Better Auth guardada.${suffix}`
    case "auth":
      return `Neon Data API rechazó el JWT enviado para ${resource}. Si la sesión Better Auth ya no puede rehidratarse, vuelve a iniciar sesión.${suffix}`
    case "permissions":
      return `Neon Data API rechazó el acceso a ${resource}. Revisa permisos o políticas RLS del token OAuth en Neon.${suffix}`
    case "config":
      return `Neon Data API devolvió un error de configuración al consultar ${resource}. Revisa apiUrl, el proyecto/entorno apuntado y que las tablas o rutas existan.${suffix}`
    default:
      return parsedMessage ?? `Error ${status} al consultar Neon Data API (${resource})`
  }
}

export function describeDataApiError(error: unknown): string {
  if (error instanceof DataApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function dataApiRequestInternal<T>(
  resource: string,
  options: RequestOptions,
  hasRetried: boolean
): Promise<T> {
  const authResolution = await resolveAuthenticatedContext({
    allowReauth: !hasRetried,
    resource,
  })
  const {
    context: { config, session },
    reauthenticated,
  } = authResolution
  const url = new URL(`${normalizeBaseUrl(config.apiUrl)}/${resource.replace(/^\/+/, "")}`)

  if (options.searchParams) {
    appendSearch(url, options.searchParams)
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${session.accessToken ?? ""}`,
    ...options.headers,
  }

  if (!hasCachedAccessToken(session)) {
    throw new Error("No hay un JWT disponible para consultar Neon Data API.")
  }

  let body: string | undefined
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(options.body)
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
  })

  const parsed = await parseResponse(res)
  if (!res.ok) {
    const kind = classifyDataApiError(res.status, parsed)
    if (!hasRetried && !reauthenticated && (kind === "session-expired" || kind === "auth")) {
      await reauthenticateSession(config, kind === "session-expired" ? "expired" : "rejected", resource, session)
      return dataApiRequestInternal<T>(resource, options, true)
    }
    throw new DataApiError(
      buildDataApiErrorMessage(kind, res.status, resource, parsed),
      res.status,
      parsed,
      kind,
      resource
    )
  }

  return parsed as T
}

export async function dataApiRequest<T>(
  resource: string,
  options: RequestOptions = {}
): Promise<T> {
  return dataApiRequestInternal<T>(resource, options, false)
}
