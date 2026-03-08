import fs from "fs-extra"
import path from "path"

/**
 * Organiza archivos del directorio por extensión: crea una carpeta por extensión
 * (ej. rar/, exe/, xlsx/) y mueve los archivos ahí. Solo primer nivel.
 */
export async function runOrganize(dirPath: string): Promise<void> {
  const dir = path.resolve(dirPath)
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    console.error("No existe o no es un directorio:", dir)
    process.exit(1)
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = entries.filter((e: import("fs").Dirent) => e.isFile())
  const byExt = new Map<string, string[]>()

  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase()
    const key = (ext.startsWith(".") ? ext.slice(1) : ext) || "sin_extension"
    if (!byExt.has(key)) byExt.set(key, [])
    byExt.get(key)!.push(path.join(dir, f.name))
  }

  let moved = 0
  for (const [ext, filePaths] of byExt) {
    const subdir = path.join(dir, ext)
    await fs.ensureDir(subdir)
    for (const fp of filePaths) {
      const base = path.basename(fp)
      const dest = path.join(subdir, base)
      await fs.move(fp, dest, { overwrite: false })
      moved++
    }
  }

  console.log("Organizado por extensión:", dir, "-", moved, "archivos movidos.")
}
