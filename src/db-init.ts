import { openDatabase, databaseExists, getDbPathResolution, describeDbPathSource } from "./db.js"

export async function runDbInit(): Promise<void> {
  const resolution = getDbPathResolution()

  console.log(`DB efectiva: ${resolution.path} (${describeDbPathSource(resolution.source)}).`)

  if (databaseExists()) {
    console.log(`La base de datos ya existe en ${resolution.path}.`)
    openDatabase()
    return
  }

  openDatabase()
  console.log(`Base de datos creada y esquema aplicado en ${resolution.path}.`)
  console.log("Usa 'orgmorg db seed <directorio>' para importar datos.")
}
