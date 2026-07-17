import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let configDir = ""

beforeEach(async () => {
  configDir = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-config-"))
  process.env.ORGMORG_CONFIG_DIR = configDir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.ORGMORG_CONFIG_DIR
  await fs.remove(configDir)
})

describe("config", () => {
  it("usa endpoint default y bloquea configuración incompleta", async () => {
    const { DEFAULT_API_BASE_URL, isConfigComplete, loadConfig } = await import("../src/config.js")
    const config = await loadConfig()
    expect(config).toMatchObject({ apiBaseUrl: DEFAULT_API_BASE_URL, basePath: null, apiKey: null })
    expect(isConfigComplete(config)).toBe(false)
  })

  it("normaliza HTTPS y solo permite HTTP loopback", async () => {
    const { normalizeApiBaseUrl } = await import("../src/config.js")
    expect(normalizeApiBaseUrl("https://admin-api.or-gm.com/")).toBe("https://admin-api.or-gm.com")
    expect(normalizeApiBaseUrl("http://localhost:8000/")).toBe("http://localhost:8000")
    expect(() => normalizeApiBaseUrl("http://admin-api.or-gm.com")).toThrow("HTTPS")
  })

  it("guarda secreto con permisos restrictivos y lo enmascara", async () => {
    const { getConfigDir, getConfigPath, maskApiKey, saveConfig } = await import("../src/config.js")
    await saveConfig({
      apiBaseUrl: "https://admin-api.or-gm.com",
      basePath: "/tmp/proyectos",
      apiKey: "orgm_1234567890abcdef",
    })
    expect(JSON.parse(await fs.readFile(getConfigPath(), "utf8"))).toMatchObject({
      apiKey: "orgm_1234567890abcdef",
    })
    expect((await fs.stat(getConfigDir())).mode & 0o777).toBe(0o700)
    expect((await fs.stat(getConfigPath())).mode & 0o777).toBe(0o600)
    expect(maskApiKey("orgm_1234567890abcdef")).toBe("orgm_1234…")
  })
})
