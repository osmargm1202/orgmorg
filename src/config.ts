import fs from "fs-extra"
import path from "path"
import os from "os"

const CONFIG_DIR =
  process.env.ORGMORG_CONFIG_DIR || path.join(os.homedir(), ".config", "orgmorg")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
const SESSION_FILE = path.join(CONFIG_DIR, "session.json")

export const DEFAULT_AUTH_URL =
  "https://ep-quiet-wildflower-ai4qr9gi.neonauth.c-4.us-east-1.aws.neon.tech/orgmorg/auth"
export const DEFAULT_API_URL =
  "https://ep-quiet-wildflower-ai4qr9gi.apirest.c-4.us-east-1.aws.neon.tech/orgmorg/rest/v1"
export const DEFAULT_OAUTH_PROVIDER = "google"

export interface Config {
  authUrl: string
  apiUrl: string
  oauthProvider: string
  path?: string | null
}

export interface StoredSessionUser {
  id: string
  email?: string | null
  name?: string | null
}

export interface StoredSession {
  accessToken: string
  expiresAt: number | null
  provider: string
  user: StoredSessionUser
  createdAt: string
}

const DEFAULT_CONFIG: Config = {
  authUrl: DEFAULT_AUTH_URL,
  apiUrl: DEFAULT_API_URL,
  oauthProvider: DEFAULT_OAUTH_PROVIDER,
  path: null,
}

function normalizeConfig(raw: unknown): Config {
  const parsed = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    authUrl:
      typeof parsed.authUrl === "string" && parsed.authUrl.trim() ? parsed.authUrl : DEFAULT_AUTH_URL,
    apiUrl: typeof parsed.apiUrl === "string" && parsed.apiUrl.trim() ? parsed.apiUrl : DEFAULT_API_URL,
    oauthProvider:
      typeof parsed.oauthProvider === "string" && parsed.oauthProvider.trim()
        ? parsed.oauthProvider
        : DEFAULT_OAUTH_PROVIDER,
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

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const data = await fs.readFile(SESSION_FILE, "utf-8")
    return JSON.parse(data) as StoredSession
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null
    }
    throw err
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await fs.ensureDir(CONFIG_DIR)
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8")
  try {
    await fs.chmod(SESSION_FILE, 0o600)
  } catch {
    // Ignore chmod errors on platforms that do not support it.
  }
}

export async function clearSession(): Promise<void> {
  await fs.remove(SESSION_FILE)
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function getSessionPath(): string {
  return SESSION_FILE
}

export { CONFIG_DIR, CONFIG_FILE, SESSION_FILE }
