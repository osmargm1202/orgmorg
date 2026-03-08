import fs from "fs-extra"
import path from "path"
import { loadConfig, saveConfig, getConfigPath } from "./config.js"

export async function runConfig(sub: string, value: string | undefined): Promise<void> {
  if (sub === "jwks-url") {
    console.error(
      "La opción `jwks-url` fue retirada. Este CLI usa Neon Data API autenticada con bearer OAuth; configura `auth-url` y `api-url`."
    )
    process.exit(1)
  }

  if (!["auth-url", "api-url", "path", "oauth-provider"].includes(sub)) {
    console.error(
      "Uso: orgmorg config auth-url <url> | api-url <url> | oauth-provider <provider> | path <dir>"
    )
    process.exit(1)
  }
  if (value === undefined || value === "") {
    console.error(`Falta valor para config ${sub}. Uso: orgmorg config ${sub} <valor>`)
    process.exit(1)
  }

  const config = await loadConfig()
  if (sub === "auth-url") {
    config.authUrl = value
    await saveConfig(config)
    console.log("authUrl guardado en", getConfigPath())
    return
  }
  if (sub === "api-url") {
    config.apiUrl = value
    await saveConfig(config)
    console.log("apiUrl guardado en", getConfigPath())
    return
  }
  if (sub === "oauth-provider") {
    config.oauthProvider = value
    await saveConfig(config)
    console.log("oauthProvider guardado en", getConfigPath())
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
