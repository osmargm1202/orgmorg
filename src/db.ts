import { loadConfig, loadSession } from "./config.js"
import {
  DataApiError,
  dataApiRequest,
  hasSessionToken,
  isLikelyRestApiUrl,
  isSessionExpired,
} from "./data-api.js"

interface ProyectoRow {
  id: number | string
  nombre: string
  id_externo?: number | string | null
}

interface CotizacionRow {
  id: number | string
  cotizacion: number | string
  proyecto_id: number | string
}

interface RpcCreateCotizacionRow {
  cotizacion_id: number | string
  proyecto_id: number | string
  cotizacion: number | string
  proyecto_nombre: string
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Valor numérico inválido recibido desde la API: ${String(value)}`)
  }
  return parsed
}

function normalizeFilter(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isMissingRpc(error: unknown): boolean {
  if (!(error instanceof DataApiError)) return false
  if (error.status === 404) return true
  const detailText = JSON.stringify(error.details ?? "")
  return detailText.includes("orgmorg_create_cotizacion")
}

function isCotizacionConflict(error: unknown): boolean {
  if (!(error instanceof DataApiError)) return false
  const detailText = JSON.stringify(error.details ?? "")
  return error.status === 409 || detailText.includes("duplicate key") || detailText.includes("23505")
}

export interface ProyectoWithCotizaciones {
  id: number
  nombre: string
  cotizaciones: number[]
}

export interface CotizacionRecord {
  cotizacionId: number
  cotizacion: number
  proyectoId: number
  proyectoNombre: string
}

export interface InsertResult {
  cotizacionId: number
  proyectoId: number
  cotizacion: number
  proyectoNombre: string
}

export interface CotizacionJsonItem {
  numero_cotizacion: number
  id_proyecto: number
  nombre_proyecto: string
  estado?: string
  fecha?: string
  activo?: boolean
}

export interface CotizacionesProyectosJson {
  cotizaciones: CotizacionJsonItem[]
}

export interface SeedResult {
  proyectosInsertados: number
  cotizacionesInsertadas: number
}

export interface ProyectoListDiagnostic {
  kind: "no-match" | "no-visible-rows"
  message: string
}

export interface ProyectoListResult {
  proyectos: ProyectoWithCotizaciones[]
  diagnostic: ProyectoListDiagnostic | null
}

async function getProyectoById(id: number): Promise<ProyectoRow | null> {
  const rows = await dataApiRequest<ProyectoRow[]>("proyectos", {
    searchParams: {
      select: "id,nombre,id_externo",
      id: `eq.${id}`,
      limit: 1,
    },
  })
  return rows[0] ?? null
}

async function getProyectoRows(filter?: string): Promise<ProyectoRow[]> {
  const normalized = normalizeFilter(filter)
  return dataApiRequest<ProyectoRow[]>("proyectos", {
    searchParams: {
      select: "id,nombre,id_externo",
      order: "id.asc",
      limit: 50,
      ...(normalized ? { nombre: `ilike.*${normalized}*` } : {}),
    },
  })
}

async function hasVisibleRows(resource: "proyectos" | "cotizaciones"): Promise<boolean> {
  const rows = await dataApiRequest<Array<Record<string, unknown>>>(resource, {
    searchParams: {
      select: "id",
      limit: 1,
    },
  })
  return rows.length > 0
}

async function buildEmptyProjectsDiagnostic(filter?: string): Promise<ProyectoListDiagnostic> {
  const normalized = normalizeFilter(filter)
  const [config, session, hasVisibleProjects, hasVisibleCotizaciones] = await Promise.all([
    loadConfig().catch(() => null),
    loadSession().catch(() => null),
    normalized ? hasVisibleRows("proyectos").catch(() => false) : Promise.resolve(false),
    hasVisibleRows("cotizaciones").catch(() => false),
  ])

  if (normalized && hasVisibleProjects) {
    return {
      kind: "no-match",
      message: `No hay proyectos visibles que coincidan con “${normalized}”.`,
    }
  }

  const hints: string[] = []
  if (session && isSessionExpired(session)) {
    hints.push(
      hasSessionToken(session)
        ? "El JWT cacheado ya figura expirado; el CLI intentará renovarlo desde la sesión Better Auth guardada si esa sesión sigue vigente."
        : "La sesión local ya figura expirada y no tiene session token para rehidratarse automáticamente."
    )
  }
  if (config && !isLikelyRestApiUrl(config.apiUrl)) {
    hints.push("`apiUrl` no parece terminar en `/rest/v1`, así que podría apuntar al endpoint equivocado.")
  }
  if (hasVisibleCotizaciones && !hasVisibleProjects) {
    hints.push("Hay cotizaciones visibles pero no proyectos; eso apunta a permisos/RLS sobre `proyectos`.")
  }
  if (!hasVisibleCotizaciones) {
    hints.push(
      "Tampoco se vieron cotizaciones con esta sesión, así que puede tratarse de filas no visibles por RLS, un entorno vacío o un `apiUrl` que apunta a otro proyecto."
    )
  }

  return {
    kind: "no-visible-rows",
    message: [
      normalized
        ? `La búsqueda para “${normalized}” no devolvió proyectos visibles en Neon Data API.`
        : "Neon Data API respondió correctamente, pero no devolvió proyectos visibles.",
      "Si esperabas datos, revisa primero la sesión OAuth y luego permisos/RLS o la configuración de `apiUrl`.",
      ...hints,
    ].join(" "),
  }
}

async function getCotizacionesByProyectoIds(ids: number[]): Promise<CotizacionRow[]> {
  if (ids.length === 0) return []
  return dataApiRequest<CotizacionRow[]>("cotizaciones", {
    searchParams: {
      select: "id,cotizacion,proyecto_id",
      order: "cotizacion.asc",
      proyecto_id: `in.(${ids.join(",")})`,
    },
  })
}

export async function getLastCotizacionNumber(): Promise<number | null> {
  const rows = await dataApiRequest<Array<Pick<CotizacionRow, "cotizacion">>>("cotizaciones", {
    searchParams: {
      select: "cotizacion",
      order: "cotizacion.desc",
      limit: 1,
    },
  })
  if (rows.length === 0) return null
  return toNumber(rows[0].cotizacion)
}

export async function getNextCotizacion(): Promise<number> {
  const last = await getLastCotizacionNumber()
  return (last ?? 0) + 1
}

export async function listProyectosWithCotizaciones(
  nombreFilter?: string
): Promise<ProyectoWithCotizaciones[]> {
  const result = await listProyectosWithDiagnostics(nombreFilter)
  return result.proyectos
}

export async function listProyectosWithDiagnostics(
  nombreFilter?: string
): Promise<ProyectoListResult> {
  const proyectos = await getProyectoRows(nombreFilter)
  if (proyectos.length === 0) {
    return {
      proyectos: [],
      diagnostic: await buildEmptyProjectsDiagnostic(nombreFilter),
    }
  }

  const cotizaciones = await getCotizacionesByProyectoIds(proyectos.map((item) => toNumber(item.id)))
  const byProject = new Map<number, number[]>()

  for (const cot of cotizaciones) {
    const projectId = toNumber(cot.proyecto_id)
    const bucket = byProject.get(projectId) ?? []
    bucket.push(toNumber(cot.cotizacion))
    byProject.set(projectId, bucket)
  }

  return {
    proyectos: proyectos.map((proyecto) => ({
      id: toNumber(proyecto.id),
      nombre: proyecto.nombre,
      cotizaciones: byProject.get(toNumber(proyecto.id)) ?? [],
    })),
    diagnostic: null,
  }
}

async function tryRpcCreateCotizacion(params: {
  nombre?: string
  proyectoId?: number
}): Promise<InsertResult | null> {
  try {
    const rpcResponse = await dataApiRequest<RpcCreateCotizacionRow[] | RpcCreateCotizacionRow>(
      "rpc/orgmorg_create_cotizacion",
      {
        method: "POST",
        body: {
          p_nombre: params.nombre ?? null,
          p_proyecto_id: params.proyectoId ?? null,
        },
      }
    )

    const row = Array.isArray(rpcResponse) ? rpcResponse[0] : rpcResponse
    if (!row) {
      throw new Error("La función RPC no devolvió datos.")
    }

    return {
      cotizacionId: toNumber(row.cotizacion_id),
      proyectoId: toNumber(row.proyecto_id),
      cotizacion: toNumber(row.cotizacion),
      proyectoNombre: row.proyecto_nombre,
    }
  } catch (error) {
    if (isMissingRpc(error)) return null
    throw error
  }
}

async function insertCotizacionWithRetries(proyectoId: number, proyectoNombre: string): Promise<InsertResult> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const numero = await getNextCotizacion()

    try {
      const rows = await dataApiRequest<CotizacionRow[]>("cotizaciones", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: { cotizacion: numero, proyecto_id: proyectoId },
      })

      const created = rows[0]
      if (!created) {
        throw new Error("La API no devolvió la cotización creada.")
      }

      return {
        cotizacionId: toNumber(created.id),
        proyectoId,
        cotizacion: toNumber(created.cotizacion),
        proyectoNombre,
      }
    } catch (error) {
      if (isCotizacionConflict(error) && attempt < 4) {
        continue
      }
      throw error
    }
  }

  throw new Error("No fue posible reservar un número de cotización único.")
}

export async function insertCotizacionAndProyecto(nombre: string): Promise<InsertResult> {
  const rpcResult = await tryRpcCreateCotizacion({ nombre })
  if (rpcResult) return rpcResult

  const projectRows = await dataApiRequest<ProyectoRow[]>("proyectos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { nombre: nombre.trim() },
  })

  const project = projectRows[0]
  if (!project) {
    throw new Error("La API no devolvió el proyecto recién creado.")
  }

  return insertCotizacionWithRetries(toNumber(project.id), project.nombre)
}

export async function insertCotizacionForExistingProyecto(proyectoId: number): Promise<InsertResult> {
  const proyecto = await getProyectoById(proyectoId)
  if (!proyecto) {
    throw new Error(`No existe el proyecto con id ${proyectoId}.`)
  }

  const rpcResult = await tryRpcCreateCotizacion({ proyectoId })
  if (rpcResult) return rpcResult

  return insertCotizacionWithRetries(toNumber(proyecto.id), proyecto.nombre)
}

export async function getCotizacionRecordByNumber(numero: number): Promise<CotizacionRecord | null> {
  const cotRows = await dataApiRequest<CotizacionRow[]>("cotizaciones", {
    searchParams: {
      select: "id,cotizacion,proyecto_id",
      cotizacion: `eq.${numero}`,
      limit: 1,
    },
  })

  const cotizacion = cotRows[0]
  if (!cotizacion) return null

  const proyecto = await getProyectoById(toNumber(cotizacion.proyecto_id))
  if (!proyecto) {
    throw new Error(`La cotización ${numero} existe, pero su proyecto asociado no fue encontrado.`)
  }

  return {
    cotizacionId: toNumber(cotizacion.id),
    cotizacion: toNumber(cotizacion.cotizacion),
    proyectoId: toNumber(proyecto.id),
    proyectoNombre: proyecto.nombre,
  }
}

export async function seedFromJson(data: CotizacionesProyectosJson): Promise<SeedResult> {
  const proyectos = new Map<number, string>()
  for (const item of data.cotizaciones) {
    if (!proyectos.has(item.id_proyecto)) {
      proyectos.set(item.id_proyecto, item.nombre_proyecto)
    }
  }

  const projectIds = new Map<number, number>()

  for (const [idExterno, nombre] of proyectos) {
    const rows = await dataApiRequest<ProyectoRow[]>("proyectos", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      searchParams: {
        on_conflict: "id_externo",
      },
      body: {
        id_externo: idExterno,
        nombre,
      },
    })

    const project = rows[0]
    if (!project) {
      throw new Error(`No se pudo crear o recuperar el proyecto externo ${idExterno}.`)
    }
    projectIds.set(idExterno, toNumber(project.id))
  }

  let cotizacionesInsertadas = 0

  for (const item of data.cotizaciones) {
    const proyectoId = projectIds.get(item.id_proyecto)
    if (!proyectoId) continue

    await dataApiRequest<CotizacionRow[]>("cotizaciones", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      searchParams: {
        on_conflict: "cotizacion",
      },
      body: {
        cotizacion: item.numero_cotizacion,
        proyecto_id: proyectoId,
      },
    })
    cotizacionesInsertadas += 1
  }

  return {
    proyectosInsertados: proyectos.size,
    cotizacionesInsertadas,
  }
}

