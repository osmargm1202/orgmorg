import React from "react"
import { render } from "ink-testing-library"
import { describe, expect, it, vi } from "vitest"
import { ConfiguracionesMenuScreen } from "../src/cli/ui/screens/ConfiguracionesMenuScreen.js"
import { ApiKeyScreen } from "../src/cli/ui/screens/ApiKeyScreen.js"
import { MainMenuScreen } from "../src/cli/ui/screens/MainMenuScreen.js"
import { ConfigValueScreen } from "../src/cli/ui/screens/ConfigValueScreen.js"
import { TokenLoginScreen } from "../src/cli/ui/screens/TokenLoginScreen.js"
import { AppShell } from "../src/cli/ui/components/AppShell.js"

const wait = () => new Promise((resolve) => setTimeout(resolve, 30))

const waitForText = async (frame: () => string | undefined, text: string) => {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (frame()?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`No apareció: ${text}`)
}

describe("settings UI", () => {
  it("muestra solo búsqueda, configuración y salida en menú principal", () => {
    const { lastFrame } = render(<MainMenuScreen onSelect={() => {}} />)
    expect(lastFrame()).toContain("Buscar cotización")
    expect(lastFrame()).toContain("Configuración")
    expect(lastFrame()).toContain("Salir")
    expect(lastFrame()).not.toContain("Organizar")
    expect(lastFrame()).not.toContain("Crear cotización")
  })

  it("muestra login automático y configuración manual", () => {
    const { lastFrame } = render(
      <ConfiguracionesMenuScreen onSelect={() => {}} onBack={() => {}} />
    )
    expect(lastFrame()).toContain("Iniciar sesión / Obtener API key")
    expect(lastFrame()).toContain("Endpoint administrativo")
    expect(lastFrame()).toContain("Carpeta base")
    expect(lastFrame()).toContain("API key manual")
    expect(lastFrame()).not.toContain("base de datos")
  })

  it("muestra título ORGMorg sin ORGMcalc", () => {
    const { lastFrame } = render(
      <AppShell appVersion="2.0.0">
        <></>
      </AppShell>
    )
    expect(lastFrame()).toContain("ORGMorg")
    expect(lastFrame()).not.toContain("ORGMcalc")
  })

  it("obtiene y guarda key sin mostrar secretos", async () => {
    const saveConfig = vi.fn(async () => {})
    const obtainApiKey = vi.fn(async () => ({
      apiKey: "orgm_generated_secret",
      email: "osmar@or-gm.com",
      roleName: "CLI",
      source: "environment-jwt" as const,
    }))
    const { stdin, lastFrame } = render(
      <TokenLoginScreen
        onBack={() => {}}
        loadConfig={async () => ({
          apiBaseUrl: "https://admin-api.or-gm.com",
          basePath: "/tmp",
          apiKey: null,
        })}
        saveConfig={saveConfig}
        readEnvironmentToken={() => "jwt_super_secret"}
        obtainApiKey={obtainApiKey}
      />
    )
    await waitForText(lastFrame, "Enter usar ORGM_TOKEN")
    stdin.write("\r")
    await waitForText(lastFrame, "API key configurada")
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "orgm_generated_secret" })
    )
    expect(lastFrame()).toContain("orgm_gene…")
    expect(lastFrame()).not.toContain("jwt_super_secret")
    expect(lastFrame()).not.toContain("orgm_generated_secret")
  })

  it("no guarda configuración cuando login falla", async () => {
    const saveConfig = vi.fn(async () => {})
    const { stdin, lastFrame } = render(
      <TokenLoginScreen
        onBack={() => {}}
        loadConfig={async () => ({
          apiBaseUrl: "https://admin-api.or-gm.com",
          basePath: "/tmp",
          apiKey: null,
        })}
        saveConfig={saveConfig}
        readEnvironmentToken={() => "jwt_hidden"}
        obtainApiKey={async () => {
          throw new Error("ORGM_TOKEN no tiene el permiso usuarios:crear.")
        }}
      />
    )
    await waitForText(lastFrame, "Enter usar ORGM_TOKEN")
    stdin.write("\r")
    await waitForText(lastFrame, "usuarios:crear")
    expect(saveConfig).not.toHaveBeenCalled()
    expect(lastFrame()).toContain("usuarios:crear")
    expect(lastFrame()).not.toContain("jwt_hidden")
  })

  it("revalida API key existente antes de guardar endpoint nuevo", async () => {
    const saveConfig = vi.fn(async () => {})
    const validateCredentials = vi.fn(async () => ({
      email: "osmar@or-gm.com",
      tenantId: 1,
      expiresAt: null,
      permissions: {},
      isSuperadmin: false,
    }))
    const { stdin } = render(
      <ConfigValueScreen
        onBack={() => {}}
        configKey="apiBaseUrl"
        title="Endpoint"
        description="URL"
        placeholder="https://admin-api.or-gm.com"
        loadConfig={async () => ({ apiBaseUrl: "", basePath: "/tmp", apiKey: "orgm_valid" })}
        saveConfig={saveConfig}
        validateCredentials={validateCredentials}
      />
    )
    await wait()
    stdin.write("https://nuevo.or-gm.com")
    await wait()
    stdin.write("\r")
    await wait()
    expect(validateCredentials).toHaveBeenCalledWith({
      apiBaseUrl: "https://nuevo.or-gm.com",
      apiKey: "orgm_valid",
    })
    expect(saveConfig).toHaveBeenCalledOnce()
  })

  it("oculta key y guarda solo después de validarla", async () => {
    const saveConfig = vi.fn(async () => {})
    const validateCredentials = vi.fn(async () => ({
      email: "osmar@or-gm.com",
      tenantId: 1,
      expiresAt: null,
      permissions: {},
      isSuperadmin: false,
    }))
    const { stdin, lastFrame } = render(
      <ApiKeyScreen
        onBack={() => {}}
        loadConfig={async () => ({
          apiBaseUrl: "https://admin-api.or-gm.com",
          basePath: "/tmp",
          apiKey: null,
        })}
        saveConfig={saveConfig}
        validateCredentials={validateCredentials}
      />
    )
    await wait()
    stdin.write("orgm_super_secret")
    await wait()
    expect(lastFrame()).not.toContain("orgm_super_secret")
    expect(lastFrame()).toContain("*****************")
    stdin.write("\r")
    await wait()
    expect(validateCredentials).toHaveBeenCalledOnce()
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "orgm_super_secret" })
    )
  })
})
