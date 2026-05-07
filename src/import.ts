import path from "path"
import fs from "fs-extra"
import {
  ensureDatabase,
  importFromData,
  type ImportResult,
  type PendingClienteAssignment,
  type ClienteJsonItem,
  type ProyectoJsonItem,
  type CotizacionJsonItem,
  type CotizacionClienteJsonItem,
  type ProyectoClienteJsonItem,
} from "./db.js"

const DATA_DIR_DEFAULT = "data"
const FALLBACK_CLIENTE_ID = 55
const PENDING_EXPORT_PATH = path.resolve("exports", "clientes_pendientes.json")

export interface ImportSourceDir {
  clientes: string
  proyectos: string
  cotizaciones: string
  cotizacion_clientes: string
  proyecto_clientes: string
}

export interface PendingExportRow {
  proyecto_id: number
  proyecto_nombre: string
  cliente_id_temporal: number
  motivo: string
  cotizaciones: number[]
  cliente_sugerido: number | null
  notas: string | null
}

function resolveSourcePaths(dataDir?: string): ImportSourceDir {
  const base = path.resolve(dataDir?.trim() || DATA_DIR_DEFAULT)
  return {
    clientes: path.join(base, "cliente.json"),
    proyectos: path.join(base, "proyectos.json"),
    cotizaciones: path.join(base, "cotizaciones.json"),
    cotizacion_clientes: path.join(base, "cotizacion_clientes.json"),
    proyecto_clientes: path.join(base, "proyecto_clientes.json"),
  }
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  if (!(await fs.pathExists(filePath))) {
    return []
  }
  const raw = await fs.readFile(filePath, "utf-8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} no contiene un array JSON válido.`)
  }
  return parsed
}

export async function loadImportData(dataDir?: string): Promise<{
  clientes: ClienteJsonItem[]
  proyectos: ProyectoJsonItem[]
  cotizaciones: CotizacionJsonItem[]
  cotizacion_clientes: CotizacionClienteJsonItem[]
  proyecto_clientes: ProyectoClienteJsonItem[]
}> {
  const paths = resolveSourcePaths(dataDir)

  const [clientes, proyectos, cotizaciones, cotizacion_clientes_raw, proyecto_clientes_raw] =
    await Promise.all([
      readJsonArray(paths.clientes),
      readJsonArray(paths.proyectos),
      readJsonArray(paths.cotizaciones),
      readJsonArray(paths.cotizacion_clientes),
      readJsonArray(paths.proyecto_clientes),
    ])

  return {
    clientes: clientes as ClienteJsonItem[],
    proyectos: proyectos as ProyectoJsonItem[],
    cotizaciones: cotizaciones as CotizacionJsonItem[],
    cotizacion_clientes: cotizacion_clientes_raw as CotizacionClienteJsonItem[],
    proyecto_clientes: (proyecto_clientes_raw as Array<{ id: number; id_cliente: number; nombre_proyecto: string }>)
      .map((r) => ({ id: r.id, id_cliente: r.id_cliente, nombre_proyecto: r.nombre_proyecto })) as ProyectoClienteJsonItem[],
  }
}

export interface RunImportOptions {
  dataDir?: string
  interactive: boolean
}

export interface FullImportResult extends ImportResult {
  pendingExportPath: string
  totals: {
    clientes: number
    proyectos: number
    cotizaciones: number
  }
}

function toPendingExportRows(pending: PendingClienteAssignment[]): PendingExportRow[] {
  return pending
    .map((row) => ({
      proyecto_id: row.proyectoId,
      proyecto_nombre: row.proyectoNombre,
      cliente_id_temporal: row.clienteIdTemporal,
      motivo: row.motivo,
      cotizaciones: [...row.cotizaciones].sort((a, b) => a - b),
      cliente_sugerido: null,
      notas: null,
    }))
    .sort((a, b) => a.proyecto_id - b.proyecto_id)
}

async function writePendingExport(rows: PendingExportRow[]): Promise<string> {
  await fs.ensureDir(path.dirname(PENDING_EXPORT_PATH))
  await fs.writeJson(PENDING_EXPORT_PATH, rows, { spaces: 2 })
  return PENDING_EXPORT_PATH
}

function validatePendingAssignments(result: ImportResult, fallbackClienteId: number): void {
  const db = ensureDatabase()

  const invalidPending = db.prepare(
    `SELECT COUNT(*) as c
     FROM proyectos p
     WHERE p.cliente_id = ?
       AND EXISTS (
         SELECT 1 FROM cotizaciones c
         WHERE c.proyecto_id = p.id AND c.cliente_id != ?
       )`
  ).get(fallbackClienteId, fallbackClienteId) as { c: number }

  if (invalidPending.c > 0) {
    throw new Error(
      `Validación falló: ${invalidPending.c} proyecto(s) temporal(es) con cotizaciones fuera de cliente ${fallbackClienteId}.`
    )
  }

  const expectedPendingIds = new Set(result.pendientesClienteTemporal.map((p) => p.proyectoId))
  for (const pending of result.pendientesClienteTemporal) {
    if (pending.clienteIdTemporal !== fallbackClienteId) {
      throw new Error(`Validación falló: proyecto ${pending.proyectoId} no usa cliente temporal ${fallbackClienteId}.`)
    }
    for (const cot of pending.cotizaciones) {
      const row = db.prepare(
        "SELECT cliente_id FROM cotizaciones WHERE cotizacion = ? AND proyecto_id = ?"
      ).get(cot, pending.proyectoId) as { cliente_id: number } | undefined
      if (!row || row.cliente_id !== fallbackClienteId) {
        throw new Error(
          `Validación falló: cotización ${cot} de proyecto ${pending.proyectoId} no quedó en cliente ${fallbackClienteId}.`
        )
      }
    }
  }

  const dbPendingIds = new Set(
    (db.prepare("SELECT id FROM proyectos WHERE cliente_id = ?").all(fallbackClienteId) as Array<{ id: number }>).map((r) => r.id)
  )
  for (const id of dbPendingIds) {
    if (!expectedPendingIds.has(id)) {
      throw new Error(`Validación falló: proyecto ${id} en DB con cliente temporal no aparece en export de pendientes.`)
    }
  }
}

export async function runFullImport(options: RunImportOptions): Promise<FullImportResult> {
  const data = await loadImportData(options.dataDir)

  console.log("Archivos encontrados:")
  console.log(`  clientes:            ${data.clientes.length}`)
  console.log(`  proyectos:           ${data.proyectos.length}`)
  console.log(`  cotizaciones:        ${data.cotizaciones.length}`)
  console.log(`  cotizacion_clientes: ${data.cotizacion_clientes.length}`)
  console.log(`  proyecto_clientes:   ${data.proyecto_clientes.length}`)

  const sourceMaxProyectoId = data.proyectos.reduce((max, p) => Math.max(max, p.id), 0)
  const sourceMaxCotizacion = data.cotizaciones.reduce((max, c) => Math.max(max, c.cotizacion), 0)
  const sourceMax = { proyectoId: sourceMaxProyectoId, cotizacion: sourceMaxCotizacion }

  const result = importFromData(data, sourceMax, FALLBACK_CLIENTE_ID)

  validatePendingAssignments(result, FALLBACK_CLIENTE_ID)
  const pendingExportRows = toPendingExportRows(result.pendientesClienteTemporal)
  const pendingExportPath = await writePendingExport(pendingExportRows)

  const db = ensureDatabase()
  const totalClientes = (db.prepare("SELECT COUNT(*) as c FROM clientes").get() as { c: number }).c
  const totalProyectos = (db.prepare("SELECT COUNT(*) as c FROM proyectos").get() as { c: number }).c
  const totalCotizaciones = (db.prepare("SELECT COUNT(*) as c FROM cotizaciones").get() as { c: number }).c

  return {
    ...result,
    pendingExportPath,
    totals: {
      clientes: totalClientes,
      proyectos: totalProyectos,
      cotizaciones: totalCotizaciones,
    },
  }
}
