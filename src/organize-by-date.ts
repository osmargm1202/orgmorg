import fs from "fs-extra"
import path from "path"

async function getCreationDate(filePath: string): Promise<Date> {
  const stat = await fs.stat(filePath, { bigint: false })
  const t = stat.birthtime
  if (t && t.getTime() > 0) return t
  return stat.mtime
}

/**
 * Organiza archivos por fecha de creación en el PC (birthtime). Solo primer nivel.
 */
export async function runOrganizeByDate(dirPath: string): Promise<void> {
  const dir = path.resolve(dirPath)
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    console.error("No existe o no es un directorio:", dir)
    process.exit(1)
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = entries.filter((e: import("fs").Dirent) => e.isFile())
  const byDate = new Map<string, string[]>()

  for (const f of files) {
    const fp = path.join(dir, f.name)
    const date = await getCreationDate(fp)
    const key = date.toISOString().slice(0, 10)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(fp)
  }

  let moved = 0
  for (const [dateKey, filePaths] of byDate) {
    const subdir = path.join(dir, dateKey)
    await fs.ensureDir(subdir)
    for (const fp of filePaths) {
      const base = path.basename(fp)
      const dest = path.join(subdir, base)
      await fs.move(fp, dest, { overwrite: false })
      moved++
    }
  }

  console.log("Organizado por fecha de creación:", dir, "-", moved, "archivos movidos.")
}
