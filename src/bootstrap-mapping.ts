/**
 * Bootstrap the canonical import-mapping SQLite artifact.
 *
 * Reads:
 *   - schema/mapping-schema.sql (DDL)
 *   - data/proyectos.json + data/proyecto_clientes.json (to find unmapped projects)
 *
 * Writes:
 *   - schema/import-mapping.sqlite (the canonical mapping source)
 *
 * The mapping entries use the source project name as the initial client base
 * name. Operators update client names in the mapping SQLite to reflect
 * actual business entities before running `db seed`.
 *
 * Usage: npx tsx src/bootstrap-mapping.ts [--data-dir data] [--mapping-path schema/import-mapping.sqlite]
 */

import Database from "better-sqlite3"
import fs from "fs-extra"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, "..")

interface Args {
  dataDir: string
  mappingPath: string
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  let dataDir = path.join(PROJECT_ROOT, "data")
  let mappingPath = path.join(PROJECT_ROOT, "schema", "import-mapping.sqlite")

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--data-dir" && args[i + 1]) {
      dataDir = path.resolve(args[i + 1])
      i++
    } else if (args[i] === "--mapping-path" && args[i + 1]) {
      mappingPath = path.resolve(args[i + 1])
      i++
    }
  }

  return { dataDir, mappingPath }
}

interface ProyectoJson {
  id: number
  nombre: string
}

interface ProyectoClienteJson {
  nombre_proyecto: string
}

async function main(): Promise<void> {
  const { dataDir, mappingPath } = parseArgs()

  // Load source data
  const proyectosPath = path.join(dataDir, "proyectos.json")
  const proyectoClientesPath = path.join(dataDir, "proyecto_clientes.json")

  if (!(await fs.pathExists(proyectosPath))) {
    console.error(`No se encontró ${proyectosPath}`)
    process.exit(1)
  }

  const proyectos: ProyectoJson[] = JSON.parse(await fs.readFile(proyectosPath, "utf-8"))
  const proyectoClientes: ProyectoClienteJson[] = (await fs.pathExists(proyectoClientesPath))
    ? JSON.parse(await fs.readFile(proyectoClientesPath, "utf-8"))
    : []

  // Build set of projects that already have a client mapping
  const mappedNames = new Set<string>()
  for (const pc of proyectoClientes) {
    if (pc.nombre_proyecto) {
      mappedNames.add(pc.nombre_proyecto.trim().toUpperCase())
    }
  }

  // Find unmapped projects
  const unmapped = proyectos.filter((p) => !mappedNames.has(p.nombre.trim().toUpperCase()))
  console.log(`Proyectos totales: ${proyectos.length}`)
  console.log(`Proyectos con mapeo existente: ${proyectos.length - unmapped.length}`)
  console.log(`Proyectos sin mapeo: ${unmapped.length}`)

  // Read schema DDL
  const schemaPath = path.join(PROJECT_ROOT, "schema", "mapping-schema.sql")
  const ddl = await fs.readFile(schemaPath, "utf-8")

  // Create or overwrite the mapping SQLite
  await fs.ensureDir(path.dirname(mappingPath))
  if (await fs.pathExists(mappingPath)) {
    await fs.remove(mappingPath)
  }

  const db = new Database(mappingPath)
  db.pragma("journal_mode = WAL")
  db.exec(ddl)

  // Seed with unmapped projects using project name as initial client base name
  const insert = db.prepare(
    "INSERT INTO mapping_entries (source_project_name, cliente_base_name, notes) VALUES (?, ?, ?)"
  )

  let seeded = 0
  db.transaction(() => {
    for (const p of unmapped) {
      insert.run(p.nombre.trim().toUpperCase(), p.nombre.trim(), "auto-seeded: operator must curate actual client name")
      seeded++
    }
  })()

  db.close()

  console.log(`\nMapping SQLite creado en: ${mappingPath}`)
  console.log(`Entradas generadas: ${seeded}`)
  console.log("\nNOTA: Los nombres de cliente son placeholders.")
  console.log("Edita el mapping SQLite para asignar los nombres reales de clientes antes de ejecutar 'db seed'.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
