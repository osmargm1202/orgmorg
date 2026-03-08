import path from "path"
import fs from "fs-extra"
import {
  seedFromJson,
  getLastCotizacionNumber,
  listProyectosWithDiagnostics,
  type CotizacionesProyectosJson,
} from "./db.js"

export function getDefaultSeedJsonPath(): string {
  return path.join(process.cwd(), "cotizaciones_proyctos.json")
}

export async function seedDbFromJsonPath(jsonPath?: string): Promise<{
  resolvedPath: string
  proyectosInsertados: number
  cotizacionesInsertadas: number
}> {
  const resolved = path.resolve(jsonPath?.trim() || getDefaultSeedJsonPath())
  if (!(await fs.pathExists(resolved))) {
    throw new Error(`Archivo no encontrado: ${resolved}`)
  }
  const raw = await fs.readFile(resolved, "utf-8")
  const data = JSON.parse(raw) as CotizacionesProyectosJson
  if (!Array.isArray(data?.cotizaciones)) {
    throw new Error("El JSON debe tener un array 'cotizaciones'.")
  }
  const result = await seedFromJson(data)
  return {
    resolvedPath: resolved,
    ...result,
  }
}

export async function runDbSeed(jsonPath?: string): Promise<void> {
  const result = await seedDbFromJsonPath(jsonPath)
  console.log(
    `Listo. Archivo: ${result.resolvedPath}. Proyectos: ${result.proyectosInsertados}, cotizaciones: ${result.cotizacionesInsertadas}`
  )
}

export async function runDbLast(): Promise<void> {
  const last = await getLastCotizacionNumber()
  console.log(last == null ? "No hay cotizaciones aún." : `Último número: ${last}`)
}

export async function runDbList(nombreFilter?: string): Promise<void> {
  const result = await listProyectosWithDiagnostics(nombreFilter)
  if (result.proyectos.length === 0) {
    console.log(result.diagnostic?.message ?? "No hay proyectos visibles.")
    return
  }
  for (const p of result.proyectos) {
    const cots = p.cotizaciones.length > 10 ? `${p.cotizaciones.slice(0, 5).join(", ")}… (${p.cotizaciones.length})` : p.cotizaciones.join(", ") || "—"
    console.log(`id ${p.id} · ${p.nombre} · cotizaciones: ${cots}`)
  }
}
