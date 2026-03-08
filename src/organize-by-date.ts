import type { Dirent } from "fs"
import fs from "fs-extra"
import path from "path"

export type DateGranularity = "year" | "month" | "day"

function isManagedDateRoot(entry: Dirent): boolean {
  return entry.isDirectory() && /^\d{4}$/.test(entry.name)
}

async function getModifiedDate(entryPath: string): Promise<Date> {
  const stat = await fs.stat(entryPath, { bigint: false })
  return stat.mtime
}

function getDestinationDir(dir: string, date: Date, granularity: DateGranularity): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  if (granularity === "year") {
    return path.join(dir, year)
  }
  if (granularity === "month") {
    return path.join(dir, year, month)
  }
  return path.join(dir, year, month, day)
}

async function moveEntry(sourcePath: string, destinationDir: string, entryName: string): Promise<void> {
  const destinationPath = path.join(destinationDir, entryName)

  if (await fs.pathExists(destinationPath)) {
    throw new Error(
      `Conflicto al mover "${entryName}" a "${destinationPath}": ya existe un archivo o carpeta con ese nombre.`
    )
  }

  await fs.ensureDir(destinationDir)

  try {
    await fs.move(sourcePath, destinationPath, { overwrite: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`No se pudo mover "${entryName}" a "${destinationPath}": ${message}`)
  }
}

/**
 * Organiza entradas del primer nivel por fecha de modificación (mtime).
 * Los directorios del primer nivel se mueven como una sola unidad.
 */
export async function runOrganizeByDate(dirPath: string, granularity: DateGranularity): Promise<void> {
  const dir = path.resolve(dirPath)
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    console.error("No existe o no es un directorio:", dir)
    process.exit(1)
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const movableEntries = entries.filter((entry) => {
    if (isManagedDateRoot(entry)) {
      return false
    }
    return entry.isFile() || entry.isDirectory()
  })

  let moved = 0
  for (const entry of movableEntries) {
    const sourcePath = path.join(dir, entry.name)
    const modifiedAt = await getModifiedDate(sourcePath)
    const destinationDir = getDestinationDir(dir, modifiedAt, granularity)
    await moveEntry(sourcePath, destinationDir, entry.name)
    moved++
  }

  console.log(`Organizado por fecha (${granularity}, usando mtime): ${dir} - ${moved} entradas movidas.`)
}
