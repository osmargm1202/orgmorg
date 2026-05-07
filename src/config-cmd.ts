import fs from "fs-extra"
import path from "path"
import { loadConfig, saveConfig } from "./config.js"
import { getDbPathResolution, describeDbPathSource, setDbPath } from "./db.js"

export async function runConfig(sub: string, value: string | undefined): Promise<void> {
  // Deprecated Neon config keys
  if (["auth-url", "api-url", "oauth-provider", "jwks-url"].includes(sub)) {
    console.error(
      `La opción de configuración '${sub}' ya no está disponible. Esta versión usa SQLite local.`
    )
    process.exit(1)
  }

  if (!["db-path", "path"].includes(sub)) {
    console.error(
      "Uso: orgmorg config db-path <ruta> | path <dir>"
    )
    process.exit(1)
  }
  if (value === undefined || value === "") {
    console.error(`Falta valor para config ${sub}. Uso: orgmorg config ${sub} <valor>`)
    process.exit(1)
  }

  const config = await loadConfig()
  if (sub === "db-path") {
    const resolved = path.resolve(value)
    config.dbPath = resolved
    await saveConfig(config)
    setDbPath(resolved)
    const effective = getDbPathResolution()
    console.log("dbPath guardado:", resolved)
    console.log(`DB efectiva actual: ${effective.path} (${describeDbPathSource(effective.source)}).`)
    return
  }
  if (sub === "path") {
    const dir = path.resolve(value)
    await fs.ensureDir(dir)
    config.path = dir
    await saveConfig(config)
    console.log("path guardado:", dir)
  }
}
