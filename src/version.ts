import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_JSON_PATH = path.join(__dirname, "..", "package.json")

function readVersion(): string {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf-8")
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === "string" && parsed.version.trim().length > 0
      ? parsed.version
      : "desconocida"
  } catch {
    return "desconocida"
  }
}

export const CLI_VERSION = readVersion()
