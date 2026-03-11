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
  sessionToken?: string | null
  sessionId?: string | null
  sessionExpiresAt?: number | null
  accessToken?: string | null
  expiresAt: number | null
  provider: string
  user: StoredSessionUser
  createdAt: string
  updatedAt?: string | null
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

function normalizeEpochSeconds(value: unknown): number | null {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Math.floor(new Date(value).getTime() / 1000)
      : value instanceof Date
        ? Math.floor(value.getTime() / 1000)
        : null
}

function normalizeStoredSession(raw: unknown): StoredSession {
  const parsed = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  const user =
    typeof parsed.user === "object" && parsed.user !== null
      ? (parsed.user as Record<string, unknown>)
      : {}

  const userId = typeof user.id === "string" && user.id.trim().length > 0 ? user.id : null
  if (!userId) {
    throw new Error("La sesión guardada no contiene un usuario válido.")
  }

  return {
    sessionToken:
      typeof parsed.sessionToken === "string" && parsed.sessionToken.trim().length > 0
        ? parsed.sessionToken
        : null,
    sessionId:
      typeof parsed.sessionId === "string" && parsed.sessionId.trim().length > 0
        ? parsed.sessionId
        : null,
    sessionExpiresAt: normalizeEpochSeconds(parsed.sessionExpiresAt ?? null),
    accessToken:
      typeof parsed.accessToken === "string" && parsed.accessToken.trim().length > 0
        ? parsed.accessToken
        : null,
    expiresAt: normalizeEpochSeconds(parsed.expiresAt ?? null),
    provider:
      typeof parsed.provider === "string" && parsed.provider.trim().length > 0
        ? parsed.provider
        : DEFAULT_OAUTH_PROVIDER,
    createdAt:
      typeof parsed.createdAt === "string" && parsed.createdAt.trim().length > 0
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0
        ? parsed.updatedAt
        : null,
    user: {
      id: userId,
      email:
        typeof user.email === "string"
          ? user.email
          : user.email === null
            ? null
            : null,
      name:
        typeof user.name === "string"
          ? user.name
          : user.name === null
            ? null
            : null,
    },
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
    return normalizeStoredSession(JSON.parse(data))
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return null
    }
    throw err
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await fs.ensureDir(CONFIG_DIR)
  await fs.writeFile(SESSION_FILE, JSON.stringify(normalizeStoredSession(session), null, 2), "utf-8")
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
