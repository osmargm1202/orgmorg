import fs from "fs-extra"
import path from "path"
import os from "os"

const CONFIG_DIR =
  process.env.ORGMORG_CONFIG_DIR || path.join(os.homedir(), ".config", "orgmorg")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

export const DEFAULT_DB_PATH = path.join(CONFIG_DIR, "proyectos.db")

export interface Config {
  dbPath: string
  path?: string | null
}

const DEFAULT_CONFIG: Config = {
  dbPath: DEFAULT_DB_PATH,
  path: null,
}

function normalizeConfig(raw: unknown): Config {
  const parsed = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    dbPath:
      typeof parsed.dbPath === "string" && parsed.dbPath.trim()
        ? parsed.dbPath
        : DEFAULT_DB_PATH,
    path: typeof parsed.path === "string" && parsed.path.trim() ? parsed.path : null,
  }
}

export async function loadConfig(): Promise<Config> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8")
    return normalizeConfig(JSON.parse(data))
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return { ...DEFAULT_CONFIG }
    }
    throw err
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.ensureDir(CONFIG_DIR)
  await fs.writeFile(CONFIG_FILE, JSON.stringify(normalizeConfig(config), null, 2), "utf-8")
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function getConfigDir(): string {
  return CONFIG_DIR
}

export { CONFIG_DIR, CONFIG_FILE }
