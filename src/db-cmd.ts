import {
  getLastCotizacionNumber,
  listProyectosWithDiagnostics,
  ensureDatabase,
  verifyImportMappings,
  getDbPathResolution,
  describeDbPathSource,
} from "./db.js"
import { runFullImport } from "./import.js"

export async function runDbSeed(dataDir?: string, interactive = false): Promise<void> {
  const resolution = getDbPathResolution()
  console.log(`DB efectiva: ${resolution.path} (${describeDbPathSource(resolution.source)}).`)

  ensureDatabase()
  const result = await runFullImport({ dataDir, interactive })

  console.log(`\nTotales finales en base de datos:`)
  console.log(`  Clientes:                ${result.totals.clientes}`)
  console.log(`  Proyectos:               ${result.totals.proyectos}`)
  console.log(`  Cotizaciones:            ${result.totals.cotizaciones}`)
  console.log(`  Proyectos en cliente 55: ${result.proyectosClienteTemporal}`)
  console.log(`  Cotizaciones en cliente 55: ${result.cotizacionesClienteTemporal}`)
  console.log(`  Export pendientes:       ${result.pendingExportPath}`)
}

export async function runDbLast(): Promise<void> {
  const last = getLastCotizacionNumber()
  console.log(last == null ? "No hay cotizaciones aún." : `Último número: ${last}`)
}

export async function runDbList(nombreFilter?: string): Promise<void> {
  const result = listProyectosWithDiagnostics(nombreFilter)
  if (result.proyectos.length === 0) {
    console.log(result.diagnostic?.message ?? "No hay proyectos.")
    return
  }
  for (const p of result.proyectos) {
    const cots = p.cotizaciones.length > 10 ? `${p.cotizaciones.slice(0, 5).join(", ")}… (${p.cotizaciones.length})` : p.cotizaciones.join(", ") || "—"
    console.log(`id ${p.id} · ${p.nombre} · cliente: ${p.clienteNombre} · cotizaciones: ${cots}`)
  }
}

export async function runDbVerify(): Promise<void> {
  ensureDatabase()
  const report = verifyImportMappings()

  console.log("Verificación de mapeos de importación:")
  console.log("=".repeat(50))

  if (report.matchedExisting.length > 0) {
    console.log(`\nClientes existentes reutilizados (${report.matchedExisting.length}):`)
    for (const r of report.matchedExisting) {
      console.log(`  ${r.sourceName} → ${r.clienteName} (id ${r.clienteId})`)
    }
  }

  if (report.newlyCreated.length > 0) {
    console.log(`\nClientes nuevos creados (${report.newlyCreated.length}):`)
    for (const r of report.newlyCreated) {
      console.log(`  ${r.sourceName} → ${r.clienteName} (id ${r.clienteId})`)
    }
  }

  if (report.stillPending.length > 0) {
    console.log(`\nPendientes de resolver (${report.stillPending.length}):`)
    for (const r of report.stillPending) {
      console.log(`  ${r.sourceName} → base: ${r.clienteBaseName}`)
    }
  }

  const total = report.matchedExisting.length + report.newlyCreated.length + report.stillPending.length
  if (total === 0) {
    console.log("\nNo hay mapeos de importación registrados.")
  } else {
    console.log(`\nTotal: ${total} mapeos (${report.matchedExisting.length} reusados, ${report.newlyCreated.length} nuevos, ${report.stillPending.length} pendientes)`)
  }
}
