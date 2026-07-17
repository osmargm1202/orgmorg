import React from "react"
import { render } from "ink-testing-library"
import { describe, expect, it, vi } from "vitest"
import { ConfiguracionesMenuScreen } from "../src/cli/ui/screens/ConfiguracionesMenuScreen.js"
import { ApiKeyScreen } from "../src/cli/ui/screens/ApiKeyScreen.js"
import { MainMenuScreen } from "../src/cli/ui/screens/MainMenuScreen.js"

const wait = () => new Promise((resolve) => setTimeout(resolve, 30))

describe("settings UI", () => {
  it("muestra solo búsqueda, configuración y salida en menú principal", () => {
    const { lastFrame } = render(<MainMenuScreen onSelect={() => {}} />)
    expect(lastFrame()).toContain("Buscar cotización")
    expect(lastFrame()).toContain("Configuración")
    expect(lastFrame()).toContain("Salir")
    expect(lastFrame()).not.toContain("Organizar")
    expect(lastFrame()).not.toContain("Crear cotización")
  })

  it("muestra solo las tres configuraciones nuevas", () => {
    const { lastFrame } = render(
      <ConfiguracionesMenuScreen onSelect={() => {}} onBack={() => {}} />
    )
    expect(lastFrame()).toContain("Endpoint administrativo")
    expect(lastFrame()).toContain("Carpeta base")
    expect(lastFrame()).toContain("API key")
    expect(lastFrame()).not.toContain("base de datos")
  })

  it("oculta key y guarda solo después de validarla", async () => {
    const saveConfig = vi.fn(async () => {})
    const validateCredentials = vi.fn(async () => ({
      email: "osmar@or-gm.com",
      tenantId: 1,
      expiresAt: null,
      permissions: {},
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
