import fs from "fs-extra"
import path from "path"
import { fileURLToPath } from "url"
import { loadConfig } from "../config.js"
import {
  getCotizacionRecordByNumber,
  getNextCotizacion,
  insertCotizacionAndProyecto,
  insertCotizacionForExistingProyecto,
  getClienteById,
  type CotizacionRecord,
  type InsertResult,
} from "../db.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.join(__dirname, "../..")
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "template")

export type CreateCotizacionInput =
  | { kind: "new"; nombre: string; clienteId: number }
  | { kind: "existing"; proyectoId: number; nombre: string }

export interface CreateCotizacionPreview {
  numero: number
  nombre: string
  clienteId: number
  clienteNombre: string
  folderName: string
  targetDir: string
  baseDir: string
  existingProject: boolean
  proyectoId?: number
}

export interface CreateCotizacionResult extends InsertResult {
  targetDir: string
  folderName: string
}

export class FolderCreationAfterPersistError extends Error {
  constructor(
    message: string,
    public readonly result: InsertResult,
    public readonly targetDir: string
  ) {
    super(message)
    this.name = "FolderCreationAfterPersistError"
  }
}

function normalizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("El nombre del proyecto no puede estar vacío.")
  }
  return trimmed
}

function buildFolderName(numero: number, nombre: string): string {
  return `${numero} - ${nombre}`
}

async function getBaseDir(): Promise<string> {
  const config = await loadConfig()
  return config.path ? path.resolve(config.path) : process.cwd()
}

async function ensureFolderCanBePrepared(targetDir: string): Promise<void> {
  if (await fs.pathExists(targetDir)) {
    const stats = await fs.stat(targetDir)
    if (!stats.isDirectory()) {
      throw new Error(`La ruta ya existe y no es un directorio: ${targetDir}`)
    }
  }
  if (!(await fs.pathExists(TEMPLATE_DIR))) {
    throw new Error(`No se encontró la carpeta template en: ${TEMPLATE_DIR}`)
  }
}

async function createFolder(targetDir: string): Promise<void> {
  await fs.ensureDir(targetDir)
  await fs.copy(TEMPLATE_DIR, targetDir, {
    overwrite: false,
    errorOnExist: false,
  })
}

function resolveClienteId(input: CreateCotizacionInput, proyectoClienteId?: number): number {
  if (input.kind === "new") {
    return input.clienteId
  }
  // For existing proyecto, cliente comes from the project itself
  return proyectoClienteId ?? 0
}

export async function getCreateCotizacionPreview(
  input: CreateCotizacionInput
): Promise<CreateCotizacionPreview> {
  const nombre = normalizeName(input.nombre)
  const [numero, baseDir] = await Promise.all([getNextCotizacion(), getBaseDir()])
  const folderName = buildFolderName(numero, nombre)
  const targetDir = path.join(baseDir, folderName)

  let clienteId = 0
  let clienteNombre = ""

  if (input.kind === "new") {
    clienteId = input.clienteId
    const cliente = getClienteById(clienteId)
    clienteNombre = cliente?.nombre ?? `Cliente ${clienteId}`
  } else {
    // For existing proyecto, we need to get the cliente from the project
    const { getProyectoById } = await import("../db.js")
    const proyecto = getProyectoById(input.proyectoId)
    if (proyecto) {
      clienteId = proyecto.cliente_id
      const cliente = getClienteById(clienteId)
      clienteNombre = cliente?.nombre ?? `Cliente ${clienteId}`
    }
  }

  return {
    numero,
    nombre,
    clienteId,
    clienteNombre,
    folderName,
    targetDir,
    baseDir,
    existingProject: input.kind === "existing",
    proyectoId: input.kind === "existing" ? input.proyectoId : undefined,
  }
}

export async function createCotizacionWithFolder(
  input: CreateCotizacionInput
): Promise<CreateCotizacionResult> {
  const preview = await getCreateCotizacionPreview(input)

  // Validamos antes de persistir para reducir fallos evitables, pero mantenemos
  // el orden requerido: primero la BD y después la creación física de la carpeta.
  await ensureFolderCanBePrepared(preview.targetDir)

  const result =
    input.kind === "new"
      ? await insertCotizacionAndProyecto(preview.nombre, input.clienteId)
      : await insertCotizacionForExistingProyecto(input.proyectoId)

  const folderName = buildFolderName(result.cotizacion, result.proyectoNombre)
  const baseDir = await getBaseDir()
  const targetDir = path.join(baseDir, folderName)

  try {
    await ensureFolderCanBePrepared(targetDir)
    await createFolder(targetDir)
  } catch (error) {
    throw new FolderCreationAfterPersistError(
      error instanceof Error ? error.message : String(error),
      result,
      targetDir
    )
  }

  return {
    ...result,
    folderName,
    targetDir,
  }
}

export async function recreateFolderFromCotizacion(numero: number): Promise<CotizacionRecord & {
  folderName: string
  targetDir: string
}> {
  const record = getCotizacionRecordByNumber(numero)
  if (!record) {
    throw new Error(`No existe una cotización con el número ${numero}.`)
  }

  const baseDir = await getBaseDir()
  const folderName = buildFolderName(record.cotizacion, record.proyectoNombre)
  const targetDir = path.join(baseDir, folderName)

  await ensureFolderCanBePrepared(targetDir)
  await createFolder(targetDir)

  return {
    ...record,
    folderName,
    targetDir,
  }
}
