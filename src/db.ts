import Database from "better-sqlite3"
import fs from "fs-extra"
import path from "path"
import { SQLITE_BOOTSTRAP_SQL } from "./schema-sqlite.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClienteRow {
  id: number
  nombre: string
  nombre_comercial: string | null
  numero: string | null
}

export interface ProyectoRow {
  id: number
  nombre: string
  cliente_id: number
  id_externo: number | null
}

interface CotizacionRow {
  id: number
  cotizacion: number
  proyecto_id: number
  cliente_id: number
}

export interface ProyectoWithCotizaciones {
  id: number
  nombre: string
  clienteId: number
  clienteNombre: string
  cotizaciones: number[]
}

export interface CotizacionRecord {
  cotizacionId: number
  cotizacion: number
  proyectoId: number
  proyectoNombre: string
  clienteId: number
  clienteNombre: string
}

export interface InsertResult {
  cotizacionId: number
  proyectoId: number
  cotizacion: number
  proyectoNombre: string
  clienteId: number
}

export interface ProyectoUpdateResult {
  id: number
  nombre: string
}

export interface SeedResult {
  proyectosInsertados: number
  cotizacionesInsertadas: number
  clientesInsertados: number
}

export interface ProyectoListDiagnostic {
  kind: "no-match" | "empty"
  message: string
}

export interface ProyectoListResult {
  proyectos: ProyectoWithCotizaciones[]
  diagnostic: ProyectoListDiagnostic | null
}

// JSON import item types — matching actual data/*.json structure
export interface ClienteJsonItem {
  id: number
  nombre: string
  nombre_comercial?: string | null
  numero?: string | null
  activo?: boolean
}

export interface ProyectoJsonItem {
  id: number
  id_externo: number | null
  nombre: string
}

export interface CotizacionJsonItem {
  id: number
  cotizacion: number
  proyecto_id: number
}

export interface CotizacionClienteJsonItem {
  id: number // same as cotizacion number
  id_cliente: number
  id_proyecto: number // old external project id (may not match current)
}

export interface ProyectoClienteJsonItem {
  id: number
  id_cliente: number
  nombre_proyecto: string
}

export interface AmbiguousMatch {
  kind: "proyecto" | "cotizacion"
  /** For proyectos: the project id. For cotizaciones: the cotizacion number. */
  sourceId: number
  /** For proyectos: the project name. For cotizaciones: the project name (if known). */
  nombre: string
  /** For cotizaciones: the proyecto_id this cotizacion belongs to. */
  proyectoId?: number
  reason: string
}

export interface PendingClienteAssignment {
  proyectoId: number
  proyectoNombre: string
  clienteIdTemporal: number
  motivo: string
  cotizaciones: number[]
}

export interface ImportResult {
  clientesInsertados: number
  proyectosInsertados: number
  cotizacionesInsertadas: number
  clientesResueltos: number
  clientesInferidos: number
  proyectosClienteTemporal: number
  cotizacionesClienteTemporal: number
  pendientesClienteTemporal: PendingClienteAssignment[]
  sinResolver: AmbiguousMatch[]
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null
let _openDbPath: string | null = null
let _dbPathOverride: string | null = null

export const DB_PATH_ENV_VAR = "ORGMORG_DB_PATH"

export type DbPathSource = "argument" | "env" | "config" | "default"

export interface DbPathResolution {
  path: string
  source: DbPathSource
}

export function setDbPath(dbPath?: string): void {
  _dbPathOverride = dbPath?.trim() ? path.resolve(dbPath) : null
}

function getDefaultDbPath(): string {
  const configDir = process.env.ORGMORG_CONFIG_DIR || path.join(process.env.HOME || "~", ".config", "orgmorg")
  return path.join(configDir, "proyectos.db")
}

export function getDbPathResolution(dbPath?: string): DbPathResolution {
  if (dbPath?.trim()) {
    return { path: path.resolve(dbPath), source: "argument" }
  }

  const envValue = process.env[DB_PATH_ENV_VAR]?.trim()
  if (envValue) {
    return { path: path.resolve(envValue), source: "env" }
  }

  if (_dbPathOverride?.trim()) {
    return { path: path.resolve(_dbPathOverride), source: "config" }
  }

  return { path: getDefaultDbPath(), source: "default" }
}

export function describeDbPathSource(source: DbPathSource): string {
  if (source === "env") return `${DB_PATH_ENV_VAR} (override por entorno)`
  if (source === "config") return "config db-path"
  if (source === "argument") return "argumento explícito"
  return "ruta default"
}

function resolveDbPath(dbPath?: string): string {
  return getDbPathResolution(dbPath).path
}

function getDb(dbPath?: string): Database.Database {
  const resolvedPath = resolveDbPath(dbPath)

  // If already open at this path, reuse
  if (_db && _openDbPath === resolvedPath) return _db

  const dir = path.dirname(resolvedPath)
  fs.ensureDirSync(dir)

  const db = new Database(resolvedPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  return db
}

/**
 * Open (or re-open) the SQLite database at the given path.
 * Applies bootstrap schema if the database is new (no tables yet).
 */
export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = resolveDbPath(dbPath)

  // Close existing connection if switching paths
  if (_db && _openDbPath !== resolvedPath) {
    _db.close()
    _db = null
    _openDbPath = null
  }

  const db = getDb(dbPath)
  _db = db
  _openDbPath = resolvedPath

  // Always apply bootstrap schema (CREATE IF NOT EXISTS)
  db.exec(SQLITE_BOOTSTRAP_SQL)

  return db
}

/**
 * Ensure a database connection is open. If the DB file does not exist,
 * throws a clear error (the caller should have bootstrapped first).
 */
export function ensureDatabase(dbPath?: string): Database.Database {
  const resolvedPath = resolveDbPath(dbPath)

  if (_db && _openDbPath === resolvedPath) return _db

  if (_db && _openDbPath !== resolvedPath) {
    _db.close()
    _db = null
    _openDbPath = null
  }

  if (!fs.pathExistsSync(resolvedPath)) {
    throw new Error(
      `La base de datos no existe en ${resolvedPath}. ` +
      `Ejecuta 'orgmorg db init' para crearla.`
    )
  }
  return openDatabase(dbPath)
}

/**
 * Close the current database connection.
 */
export function closeDatabase(): void {
  if (_db) {
    _db.close()
    _db = null
    _openDbPath = null
  }
}

/**
 * Returns true if the database file exists at the configured or given path.
 */
export function databaseExists(dbPath?: string): boolean {
  const resolvedPath = resolveDbPath(dbPath)
  return fs.pathExistsSync(resolvedPath)
}

/**
 * Get the current effective DB path (for display purposes).
 */
export function getEffectiveDbPath(): string {
  return resolveDbPath()
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export function getClienteById(id: number): ClienteRow | null {
  const db = ensureDatabase()
  const row = db.prepare("SELECT id, nombre, nombre_comercial, numero FROM clientes WHERE id = ?").get(id) as ClienteRow | undefined
  return row ?? null
}

export function listClientes(search?: string): ClienteRow[] {
  const db = ensureDatabase()
  if (search?.trim()) {
    return db.prepare(
      "SELECT id, nombre, nombre_comercial, numero FROM clientes WHERE nombre LIKE ? ORDER BY nombre LIMIT 50"
    ).all(`%${search.trim()}%`) as ClienteRow[]
  }
  return db.prepare(
    "SELECT id, nombre, nombre_comercial, numero FROM clientes ORDER BY nombre LIMIT 50"
  ).all() as ClienteRow[]
}

export function insertCliente(
  id: number | null,
  nombre: string,
  nombreComercial?: string | null,
  numero?: string | null
): number {
  const db = ensureDatabase()
  if (id != null) {
    db.prepare(
      "INSERT INTO clientes (id, nombre, nombre_comercial, numero) VALUES (?, ?, ?, ?)"
    ).run(id, nombre.trim(), nombreComercial ?? null, numero ?? null)
    return id
  }
  const result = db.prepare(
    "INSERT INTO clientes (nombre, nombre_comercial, numero) VALUES (?, ?, ?)"
  ).run(nombre.trim(), nombreComercial ?? null, numero ?? null)
  return Number(result.lastInsertRowid)
}

export function getMaxClienteId(): number {
  const db = ensureDatabase()
  const row = db.prepare("SELECT COALESCE(MAX(id), 0) as maxId FROM clientes").get() as { maxId: number }
  return row.maxId
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

export function getProyectoById(id: number): ProyectoRow | null {
  const db = ensureDatabase()
  const row = db.prepare(
    "SELECT id, nombre, cliente_id, id_externo FROM proyectos WHERE id = ?"
  ).get(id) as ProyectoRow | undefined
  return row ?? null
}

export function updateProyectoNombre(id: number, nombre: string): ProyectoUpdateResult {
  const normalized = nombre.trim()
  if (!normalized) {
    throw new Error("El nombre del proyecto no puede estar vacío.")
  }

  const db = ensureDatabase()
  const result = db.prepare("UPDATE proyectos SET nombre = ? WHERE id = ?").run(normalized, id)
  if (result.changes === 0) {
    throw new Error(`No existe el proyecto con id ${id}.`)
  }

  return { id, nombre: normalized }
}

export function listProyectosWithCotizaciones(nombreFilter?: string): ProyectoWithCotizaciones[] {
  const result = listProyectosWithDiagnostics(nombreFilter)
  return result.proyectos
}

export function listProyectosWithDiagnostics(nombreFilter?: string): ProyectoListResult {
  const db = ensureDatabase()
  const trimmed = nombreFilter?.trim()

  let proyectos: Array<{ id: number; nombre: string; cliente_id: number }>
  if (trimmed) {
    proyectos = db.prepare(
      "SELECT id, nombre, cliente_id FROM proyectos WHERE nombre LIKE ? ORDER BY id LIMIT 50"
    ).all(`%${trimmed}%`) as typeof proyectos
  } else {
    proyectos = db.prepare(
      "SELECT id, nombre, cliente_id FROM proyectos ORDER BY id LIMIT 50"
    ).all() as typeof proyectos
  }

  if (proyectos.length === 0) {
    const total = (db.prepare("SELECT COUNT(*) as c FROM proyectos").get() as { c: number }).c
    return {
      proyectos: [],
      diagnostic: {
        kind: total === 0 ? "empty" : "no-match",
        message: trimmed
          ? `No hay proyectos que coincidan con "${trimmed}".`
          : "No hay proyectos en la base de datos.",
      },
    }
  }

  // Batch-load cotizaciones
  const ids = proyectos.map((p) => p.id)
  const placeholders = ids.map(() => "?").join(",")
  const cotRows = db.prepare(
    `SELECT cotizacion, proyecto_id FROM cotizaciones WHERE proyecto_id IN (${placeholders}) ORDER BY cotizacion`
  ).all(...ids) as Array<{ cotizacion: number; proyecto_id: number }>

  const byProject = new Map<number, number[]>()
  for (const cot of cotRows) {
    const bucket = byProject.get(cot.proyecto_id) ?? []
    bucket.push(cot.cotizacion)
    byProject.set(cot.proyecto_id, bucket)
  }

  // Batch-load cliente names
  const clienteIds = [...new Set(proyectos.map((p) => p.cliente_id))]
  const clientePlaceholders = clienteIds.map(() => "?").join(",")
  const clienteRows = db.prepare(
    `SELECT id, nombre FROM clientes WHERE id IN (${clientePlaceholders})`
  ).all(...clienteIds) as Array<{ id: number; nombre: string }>
  const clienteNames = new Map(clienteRows.map((c) => [c.id, c.nombre]))

  return {
    proyectos: proyectos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      clienteId: p.cliente_id,
      clienteNombre: clienteNames.get(p.cliente_id) ?? `Cliente ${p.cliente_id}`,
      cotizaciones: byProject.get(p.id) ?? [],
    })),
    diagnostic: null,
  }
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export function getLastCotizacionNumber(): number | null {
  const db = ensureDatabase()
  // Check both the seed sequence metadata (from imports) and actual table data.
  let seedSeq = 0
  try {
    seedSeq = (db.prepare(
      "SELECT COALESCE(MAX(seq), 0) as s FROM seed_sequences WHERE name = 'cotizacion'"
    ).get() as { s: number }).s
  } catch {
    // seed_sequences table may not exist in older DBs; fall back to table data only
  }
  const tableMax = (db.prepare(
    "SELECT COALESCE(MAX(cotizacion), 0) as m FROM cotizaciones"
  ).get() as { m: number }).m
  const max = Math.max(seedSeq, tableMax)
  return max > 0 ? max : null
}

export function getNextCotizacion(): number {
  const last = getLastCotizacionNumber()
  return (last ?? 0) + 1
}

export function getCotizacionRecordByNumber(numero: number): CotizacionRecord | null {
  const db = ensureDatabase()
  const cotRow = db.prepare(
    "SELECT id, cotizacion, proyecto_id, cliente_id FROM cotizaciones WHERE cotizacion = ?"
  ).get(numero) as CotizacionRow | undefined

  if (!cotRow) return null

  const proyecto = getProyectoById(cotRow.proyecto_id)
  if (!proyecto) {
    throw new Error(`La cotización ${numero} existe, pero su proyecto asociado no fue encontrado.`)
  }

  const cliente = getClienteById(cotRow.cliente_id)
  return {
    cotizacionId: cotRow.id,
    cotizacion: cotRow.cotizacion,
    proyectoId: proyecto.id,
    proyectoNombre: proyecto.nombre,
    clienteId: cotRow.cliente_id,
    clienteNombre: cliente?.nombre ?? `Cliente ${cotRow.cliente_id}`,
  }
}

export function insertCotizacionAndProyecto(nombre: string, clienteId: number): InsertResult {
  const db = ensureDatabase()

  const cliente = getClienteById(clienteId)
  if (!cliente) {
    throw new Error(`No existe el cliente con id ${clienteId}.`)
  }

  const numero = getNextCotizacion()

  const insertProyecto = db.prepare("INSERT INTO proyectos (nombre, cliente_id) VALUES (?, ?)")
  const insertCotizacion = db.prepare(
    "INSERT INTO cotizaciones (cotizacion, proyecto_id, cliente_id) VALUES (?, ?, ?)"
  )

  const result = db.transaction(() => {
    const proyectoResult = insertProyecto.run(nombre.trim(), clienteId)
    const proyectoId = Number(proyectoResult.lastInsertRowid)
    const cotResult = insertCotizacion.run(numero, proyectoId, clienteId)
    return {
      cotizacionId: Number(cotResult.lastInsertRowid),
      proyectoId,
    }
  })()

  return {
    ...result,
    cotizacion: numero,
    proyectoNombre: nombre.trim(),
    clienteId,
  }
}

export function insertCotizacionForExistingProyecto(proyectoId: number): InsertResult {
  const db = ensureDatabase()
  const proyecto = getProyectoById(proyectoId)
  if (!proyecto) {
    throw new Error(`No existe el proyecto con id ${proyectoId}.`)
  }

  const numero = getNextCotizacion()

  const result = db.prepare(
    "INSERT INTO cotizaciones (cotizacion, proyecto_id, cliente_id) VALUES (?, ?, ?)"
  ).run(numero, proyectoId, proyecto.cliente_id)

  return {
    cotizacionId: Number(result.lastInsertRowid),
    proyectoId,
    cotizacion: numero,
    proyectoNombre: proyecto.nombre,
    clienteId: proyecto.cliente_id,
  }
}

// ---------------------------------------------------------------------------
// Import / Seed — for explicit data import (separate from bootstrap)
// ---------------------------------------------------------------------------

export function importFromData(
  data: {
    clientes?: ClienteJsonItem[]
    proyectos?: ProyectoJsonItem[]
    cotizaciones?: CotizacionJsonItem[]
    cotizacion_clientes?: CotizacionClienteJsonItem[]
    proyecto_clientes?: ProyectoClienteJsonItem[]
  },
  /** Source maxima for reseeding to prevent legacy ID collision. */
  sourceMax?: { proyectoId: number; cotizacion: number },
  fallbackClienteId = 55
): ImportResult {
  const db = ensureDatabase()

  const clientesInsertados = data.clientes
    ? importClientes(db, data.clientes)
    : 0

  const fallbackClienteExists = db.prepare("SELECT 1 FROM clientes WHERE id = ?").get(fallbackClienteId)
  if (!fallbackClienteExists) {
    throw new Error(`Cliente temporal ${fallbackClienteId} no existe en clientes. Seed abortado.`)
  }

  const proyectoClientesById = buildProyectoClientesByIdMap(data.proyecto_clientes ?? [])
  const proyectoClientesByName = buildProyectoClientesByNameMap(data.proyecto_clientes ?? [])
  const cotizacionClientesMap = buildCotizacionClientesMap(data.cotizacion_clientes ?? [])
  const sourceProjects = data.proyectos ?? []

  const {
    proyectosInsertados,
    proyectoClienteMap,
    pendingProyectos,
  } = importProyectos(db, sourceProjects, proyectoClientesById, proyectoClientesByName, fallbackClienteId)

  const {
    cotizacionesInsertadas,
    clientesResueltos,
    clientesInferidos,
    pendingCotizacionesByProyecto,
  } = importCotizaciones(
    db,
    data.cotizaciones ?? [],
    cotizacionClientesMap,
    proyectoClienteMap,
    new Set(sourceProjects.map((p) => p.id)),
    fallbackClienteId
  )

  const pendientesClienteTemporal: PendingClienteAssignment[] = pendingProyectos.map((p) => ({
    proyectoId: p.id,
    proyectoNombre: p.nombre,
    clienteIdTemporal: fallbackClienteId,
    motivo: p.reason,
    cotizaciones: pendingCotizacionesByProyecto.get(p.id) ?? [],
  }))

  const cotizacionesClienteTemporal = pendientesClienteTemporal.reduce(
    (acc, item) => acc + item.cotizaciones.length,
    0
  )

  const sinResolver: AmbiguousMatch[] = pendingProyectos.map((p) => ({
    kind: "proyecto",
    sourceId: p.id,
    nombre: p.nombre,
    reason: p.reason,
  }))

  if (sourceMax) {
    updateSeedSequences(db, sourceMax.proyectoId, sourceMax.cotizacion)
  }

  return {
    clientesInsertados,
    proyectosInsertados,
    cotizacionesInsertadas,
    clientesResueltos,
    clientesInferidos,
    proyectosClienteTemporal: pendientesClienteTemporal.length,
    cotizacionesClienteTemporal,
    pendientesClienteTemporal,
    sinResolver,
  }
}

function importClientes(db: Database.Database, clientes: ClienteJsonItem[]): number {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO clientes (id, nombre, nombre_comercial, numero) VALUES (?, ?, ?, ?)"
  )
  let count = 0
  db.transaction(() => {
    for (const c of clientes) {
      const result = insert.run(c.id, c.nombre, c.nombre_comercial ?? null, c.numero ?? null)
      count += result.changes
    }
  })()
  return count
}

function buildProyectoClientesByIdMap(
  rows: ProyectoClienteJsonItem[]
): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    if (row.id != null) {
      map.set(row.id, row.id_cliente)
    }
  }
  return map
}

function buildProyectoClientesByNameMap(
  rows: ProyectoClienteJsonItem[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.nombre_proyecto) {
      map.set(normalizeForMatch(row.nombre_proyecto), row.id_cliente)
    }
  }
  return map
}

function buildCotizacionClientesMap(
  rows: CotizacionClienteJsonItem[]
): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    map.set(row.id, row.id_cliente)
  }
  return map
}

function importProyectos(
  db: Database.Database,
  proyectos: ProyectoJsonItem[],
  proyectoClientesById: Map<number, number>,
  proyectoClientesByName: Map<string, number>,
  fallbackClienteId: number
): {
  proyectosInsertados: number
  proyectoClienteMap: Map<number, number>
  pendingProyectos: Array<{ id: number; nombre: string; reason: string }>
} {
  const upsert = db.prepare(
    `INSERT INTO proyectos (id, nombre, cliente_id, id_externo) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nombre = excluded.nombre,
       cliente_id = excluded.cliente_id,
       id_externo = excluded.id_externo`
  )
  const clienteExistsStmt = db.prepare("SELECT 1 FROM clientes WHERE id = ?")

  let count = 0
  const proyectoClienteMap = new Map<number, number>()
  const pendingProyectos: Array<{ id: number; nombre: string; reason: string }> = []

  db.transaction(() => {
    for (const p of proyectos) {
      const normalizedName = normalizeForMatch(p.nombre)
      const mappedByExternal = p.id_externo != null ? proyectoClientesById.get(p.id_externo) : undefined
      const mappedClienteId = mappedByExternal ?? proyectoClientesByName.get(normalizedName)

      let finalClienteId = fallbackClienteId
      let reason = "Sin match confiable en datos viejos"

      if (mappedClienteId !== undefined && clienteExistsStmt.get(mappedClienteId)) {
        finalClienteId = mappedClienteId
        reason = ""
      } else if (mappedClienteId !== undefined) {
        reason = `Cliente ${mappedClienteId} no existe en clientes`
      }

      const result = upsert.run(p.id, p.nombre.trim(), finalClienteId, p.id_externo ?? null)
      if (result.changes > 0) count++
      proyectoClienteMap.set(p.id, finalClienteId)

      if (finalClienteId === fallbackClienteId) {
        pendingProyectos.push({ id: p.id, nombre: p.nombre.trim(), reason })
      }
    }
  })()

  return { proyectosInsertados: count, proyectoClienteMap, pendingProyectos }
}

function importCotizaciones(
  db: Database.Database,
  cotizaciones: CotizacionJsonItem[],
  cotizacionClientesMap: Map<number, number>,
  proyectoClienteMap: Map<number, number>,
  sourceProjectIds: Set<number>,
  fallbackClienteId: number
): {
  cotizacionesInsertadas: number
  clientesResueltos: number
  clientesInferidos: number
  pendingCotizacionesByProyecto: Map<number, number[]>
} {
  const upsert = db.prepare(
    `INSERT INTO cotizaciones (cotizacion, proyecto_id, cliente_id) VALUES (?, ?, ?)
     ON CONFLICT(cotizacion) DO UPDATE SET
       proyecto_id = excluded.proyecto_id,
       cliente_id = excluded.cliente_id`
  )

  let count = 0
  let clientesResueltos = 0
  let clientesInferidos = 0
  const pendingCotizacionesByProyecto = new Map<number, number[]>()

  db.transaction(() => {
    for (const cot of cotizaciones) {
      if (!sourceProjectIds.has(cot.proyecto_id)) {
        throw new Error(
          `Cotización ${cot.cotizacion} referencia proyecto inexistente ${cot.proyecto_id} en data/proyectos.json.`
        )
      }

      const projectClienteId = proyectoClienteMap.get(cot.proyecto_id)
      if (!projectClienteId) {
        throw new Error(
          `Proyecto ${cot.proyecto_id} no tiene cliente final resuelto para cotización ${cot.cotizacion}.`
        )
      }

      if (cotizacionClientesMap.has(cot.cotizacion)) {
        clientesResueltos++
      } else {
        clientesInferidos++
      }

      const result = upsert.run(cot.cotizacion, cot.proyecto_id, projectClienteId)
      if (result.changes > 0) count++

      if (projectClienteId === fallbackClienteId) {
        const bucket = pendingCotizacionesByProyecto.get(cot.proyecto_id) ?? []
        bucket.push(cot.cotizacion)
        pendingCotizacionesByProyecto.set(cot.proyecto_id, bucket)
      }
    }
  })()

  return {
    cotizacionesInsertadas: count,
    clientesResueltos,
    clientesInferidos,
    pendingCotizacionesByProyecto,
  }
}

/**
 * Import a single proyecto with an explicitly confirmed cliente.
 * Used after the ambiguity resolution workflow.
 */
export function importSingleProyecto(
  proyectoId: number,
  nombre: string,
  clienteId: number,
  idExterno?: number | null
): boolean {
  const db = ensureDatabase()
  const result = db.prepare(
    "INSERT OR IGNORE INTO proyectos (id, nombre, cliente_id, id_externo) VALUES (?, ?, ?, ?)"
  ).run(proyectoId, nombre.trim(), clienteId, idExterno ?? null)
  return result.changes > 0
}

/**
 * Import a single cotización with an explicitly confirmed cliente.
 * Used after the ambiguity resolution workflow.
 */
export function importSingleCotizacion(
  numeroCotizacion: number,
  proyectoId: number,
  clienteId: number
): boolean {
  const db = ensureDatabase()
  const result = db.prepare(
    "INSERT OR IGNORE INTO cotizaciones (cotizacion, proyecto_id, cliente_id) VALUES (?, ?, ?)"
  ).run(numeroCotizacion, proyectoId, clienteId)
  return result.changes > 0
}

/**
 * Update seed_sequences metadata after import so new records don't collide
 * with skipped legacy IDs. No fake rows are inserted into runtime tables.
 *
 * For proyectos: sets the sqlite_sequence for the `proyectos` table so that
 * AUTOINCREMENT continues past the source maximum.
 *
 * For cotizaciones: writes to the seed_sequences metadata table so that
 * getNextCotizacion() returns values beyond all source data.
 */
function updateSeedSequences(
  db: Database.Database,
  sourceMaxProyectoId: number,
  sourceMaxCotizacion: number
): void {
  // Advance proyecto AUTOINCREMENT past source max if needed.
  // We write directly to the sqlite_sequence system table (this is the
  // documented way to control AUTOINCREMENT in SQLite).
  const currentProyectoSeq = db.prepare(
    "SELECT seq FROM sqlite_sequence WHERE name = 'proyectos'"
  ).get() as { seq: number } | undefined
  if (!currentProyectoSeq || currentProyectoSeq.seq < sourceMaxProyectoId) {
    if (currentProyectoSeq) {
      db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'proyectos'").run(sourceMaxProyectoId)
    } else {
      db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('proyectos', ?)").run(sourceMaxProyectoId)
    }
  }

  // Advance cotizacion business number past source max via metadata table.
  const currentCotSeq = (db.prepare(
    "SELECT COALESCE(MAX(seq), 0) as s FROM seed_sequences WHERE name = 'cotizacion'"
  ).get() as { s: number }).s
  if (currentCotSeq < sourceMaxCotizacion) {
    db.prepare(
      "INSERT INTO seed_sequences (name, seq) VALUES ('cotizacion', ?) ON CONFLICT(name) DO UPDATE SET seq = excluded.seq"
    ).run(sourceMaxCotizacion)
  }
}

// ---------------------------------------------------------------------------
// Import Mappings — reproducible source → cliente resolution
// ---------------------------------------------------------------------------

export interface ImportMappingRow {
  id: number
  source_project_name: string
  cliente_base_name: string
  resolved_cliente_id: number | null
  was_existing: number | null
  status: string
}

/**
 * Normalize a name for matching: uppercase, trim, collapse whitespace.
 */
export function normalizeForMatch(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ")
}

/**
 * Find an existing cliente by normalized name match.
 * Returns the first exact normalized match, or null.
 */
export function findClienteByNormalizedName(nombre: string): ClienteRow | null {
  const db = ensureDatabase()
  const normalized = normalizeForMatch(nombre)
  // Exact match on normalized form
  const rows = db.prepare(
    "SELECT id, nombre, nombre_comercial, numero FROM clientes ORDER BY id"
  ).all() as ClienteRow[]
  for (const row of rows) {
    if (normalizeForMatch(row.nombre) === normalized) {
      return row
    }
  }
  return null
}

/**
 * Upsert an import mapping entry. If the source project name already exists,
 * updates the cliente_base_name and resets status to pending.
 */
export function upsertImportMapping(
  sourceProjectName: string,
  clienteBaseName: string
): void {
  const db = ensureDatabase()
  db.prepare(
    `INSERT INTO import_mappings (source_project_name, cliente_base_name, status)
     VALUES (?, ?, 'pending')
     ON CONFLICT(source_project_name) DO UPDATE SET
       cliente_base_name = excluded.cliente_base_name,
       status = 'pending',
       resolved_cliente_id = NULL,
       resolved_at = NULL`
  ).run(normalizeForMatch(sourceProjectName), clienteBaseName.trim())
}

/**
 * Bulk upsert import mappings from a list.
 */
export function bulkUpsertImportMappings(
  mappings: Array<{ sourceProjectName: string; clienteBaseName: string }>
): number {
  const db = ensureDatabase()
  let count = 0
  db.transaction(() => {
    for (const m of mappings) {
      upsertImportMapping(m.sourceProjectName, m.clienteBaseName)
      count++
    }
  })()
  return count
}

/**
 * Load mappings from the canonical repo-owned SQLite mapping source
 * into the runtime application DB's import_mappings table.
 *
 * The canonical SQLite lives at schema/import-mapping.sqlite in the repo.
 * Each entry maps source_project_name → cliente_base_name.
 *
 * Only loads entries that are not already resolved in the runtime DB.
 * Returns the number of entries loaded.
 */
export function loadCanonicalMappings(mappingSqlitePath: string): number {
  if (!fs.pathExistsSync(mappingSqlitePath)) {
    return 0
  }

  const sourceDb = new Database(mappingSqlitePath, { readonly: true })
  const entries = sourceDb.prepare(
    "SELECT source_project_name, cliente_base_name FROM mapping_entries ORDER BY id"
  ).all() as Array<{ source_project_name: string; cliente_base_name: string }>
  sourceDb.close()

  if (entries.length === 0) {
    return 0
  }

  const db = ensureDatabase()
  let loaded = 0

  db.transaction(() => {
    for (const entry of entries) {
      // Only upsert if not already resolved — don't overwrite completed work
      const existing = db.prepare(
        "SELECT status FROM import_mappings WHERE source_project_name = ?"
      ).get(entry.source_project_name) as { status: string } | undefined

      if (existing && existing.status === "resolved") {
        continue
      }

      upsertImportMapping(entry.source_project_name, entry.cliente_base_name)
      loaded++
    }
  })()

  return loaded
}

/**
 * Get all import mappings, optionally filtered by status.
 */
export function getImportMappings(status?: string): ImportMappingRow[] {
  const db = ensureDatabase()
  if (status) {
    return db.prepare(
      "SELECT id, source_project_name, cliente_base_name, resolved_cliente_id, was_existing, status FROM import_mappings WHERE status = ? ORDER BY id"
    ).all(status) as ImportMappingRow[]
  }
  return db.prepare(
    "SELECT id, source_project_name, cliente_base_name, resolved_cliente_id, was_existing, status FROM import_mappings ORDER BY id"
  ).all() as ImportMappingRow[]
}

/**
 * Mark a mapping as resolved with the assigned cliente ID and provenance.
 */
export function markMappingResolved(mappingId: number, clienteId: number, wasExisting: boolean): void {
  const db = ensureDatabase()
  db.prepare(
    "UPDATE import_mappings SET status = 'resolved', resolved_cliente_id = ?, was_existing = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(clienteId, wasExisting ? 1 : 0, mappingId)
}

/**
 * Resolve a single mapping: find or create the cliente, return its ID.
 *
 * 1. Look up existing cliente by normalized mapping.cliente_base_name.
 * 2. If found, reuse it.
 * 3. If not found, create a new cliente with the base name.
 * 4. Mark the mapping as resolved.
 *
 * Returns the cliente ID.
 */
export function resolveMapping(mapping: ImportMappingRow): number {
  const existing = findClienteByNormalizedName(mapping.cliente_base_name)
  let clienteId: number
  let wasExisting: boolean
  if (existing) {
    clienteId = existing.id
    wasExisting = true
  } else {
    clienteId = insertCliente(null, mapping.cliente_base_name)
    wasExisting = false
  }
  markMappingResolved(mapping.id, clienteId, wasExisting)
  return clienteId
}

/**
 * Verification report: categorize mappings into matched, created, still-pending.
 */
export interface MappingVerificationReport {
  matchedExisting: Array<{ sourceName: string; clienteName: string; clienteId: number }>
  newlyCreated: Array<{ sourceName: string; clienteName: string; clienteId: number }>
  stillPending: Array<{ sourceName: string; clienteBaseName: string }>
}

export function verifyImportMappings(): MappingVerificationReport {
  const mappings = getImportMappings()
  const report: MappingVerificationReport = {
    matchedExisting: [],
    newlyCreated: [],
    stillPending: [],
  }

  for (const m of mappings) {
    if (m.status === "pending") {
      report.stillPending.push({
        sourceName: m.source_project_name,
        clienteBaseName: m.cliente_base_name,
      })
      continue
    }
    if (m.status === "resolved" && m.resolved_cliente_id) {
      const cliente = getClienteById(m.resolved_cliente_id)
      if (cliente) {
        // Use persisted provenance instead of heuristic
        const wasExisting = m.was_existing === 1
        const bucket = wasExisting ? report.matchedExisting : report.newlyCreated
        bucket.push({
          sourceName: m.source_project_name,
          clienteName: cliente.nombre,
          clienteId: cliente.id,
        })
      }
    }
  }

  return report
}
