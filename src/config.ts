import fs from "fs-extra"
import os from "node:os"
import path from "node:path"

export const DEFAULT_API_BASE_URL = "https://admin-api.or-gm.com"

export interface Config {
  apiBaseUrl: string
  basePath: string | null
  apiKey: string | null
}

export interface CompleteConfig extends Config {
  basePath: string
  apiKey: string
}

const DEFAULT_CONFIG: Config = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  basePath: null,
  apiKey: null,
}

export function getConfigDir(): string {
  return process.env.ORGMORG_CONFIG_DIR || path.join(os.homedir(), ".config", "orgmorg")
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json")
}

export function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value.trim())
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("El endpoint debe usar HTTPS; HTTP solo se permite para loopback.")
  }
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

function normalizeConfig(raw: unknown): Config {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  let apiBaseUrl = DEFAULT_API_BASE_URL
  if (typeof value.apiBaseUrl === "string" && value.apiBaseUrl.trim()) {
    try {
      apiBaseUrl = normalizeApiBaseUrl(value.apiBaseUrl)
    } catch {
      apiBaseUrl = DEFAULT_API_BASE_URL
    }
  }
  return {
    apiBaseUrl,
    basePath:
      typeof value.basePath === "string" && value.basePath.trim()
        ? path.resolve(value.basePath)
        : null,
    apiKey:
      typeof value.apiKey === "string" && value.apiKey.startsWith("orgm_")
        ? value.apiKey
        : null,
  }
}

export function isConfigComplete(config: Config): config is CompleteConfig {
  return Boolean(config.apiBaseUrl && config.basePath && config.apiKey?.startsWith("orgm_"))
}

export function maskApiKey(apiKey: string | null): string {
  return apiKey ? `${apiKey.slice(0, 9)}…` : "Sin configurar"
}

export async function loadConfig(): Promise<Config> {
  try {
    return normalizeConfig(JSON.parse(await fs.readFile(getConfigPath(), "utf8")))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ...DEFAULT_CONFIG }
    }
    throw error
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const normalized = normalizeConfig(config)
  await fs.ensureDir(getConfigDir(), { mode: 0o700 })
  await fs.chmod(getConfigDir(), 0o700)
  await fs.writeFile(getConfigPath(), JSON.stringify(normalized, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  })
  await fs.chmod(getConfigPath(), 0o600)
}
