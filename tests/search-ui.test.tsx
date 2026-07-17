import React from "react"
import { render } from "ink-testing-library"
import { expect, it, vi } from "vitest"
import { SearchQuotationScreen } from "../src/cli/ui/screens/SearchQuotationScreen.js"

const waitForText = async (frame: () => string | undefined, text: string) => {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (frame()?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`No apareció: ${text}`)
}

it("busca, selecciona, confirma y crea una carpeta", async () => {
  const sync = vi.fn(async () => ({
    folderName: "593 - Torre Central",
    targetDir: "/projects/593 - Torre Central",
    offerDir: "/projects/593 - Torre Central/Oferta",
    pdfPath: "/projects/593 - Torre Central/Oferta/cotizacion_593.pdf",
  }))
  const dependencies = {
    loadConfig: async () => ({
      apiBaseUrl: "https://admin-api.or-gm.com",
      basePath: "/projects",
      apiKey: "orgm_test",
    }),
    search: async () => [
      {
        id: 593,
        projectId: 8,
        projectName: "Torre Central",
        date: "2026-07-01",
        status: "GENERADA",
        description: "Diseño",
      },
    ],
    preview: () => ({
      folderName: "593 - Torre Central",
      targetDir: "/projects/593 - Torre Central",
      offerDir: "/projects/593 - Torre Central/Oferta",
      pdfPath: "/projects/593 - Torre Central/Oferta/cotizacion_593.pdf",
    }),
    sync,
  }
  const { stdin, lastFrame } = render(
    <SearchQuotationScreen
      onBack={() => {}}
      onConfigure={() => {}}
      dependencies={dependencies}
    />
  )
  await waitForText(lastFrame, "Nombre del proyecto")
  stdin.write("torre")
  await new Promise((resolve) => setTimeout(resolve, 30))
  stdin.write("\r")
  await waitForText(lastFrame, "593")
  expect(lastFrame()).toContain("Diseño")
  await new Promise((resolve) => setTimeout(resolve, 70))
  stdin.write("\r")
  await waitForText(lastFrame, "Confirmar")
  await new Promise((resolve) => setTimeout(resolve, 70))
  stdin.write("\r")
  await waitForText(lastFrame, "Carpeta lista")
  expect(sync).toHaveBeenCalledOnce()
})

it("dirige a configuración cuando falta un valor", async () => {
  const onConfigure = vi.fn()
  const { stdin, lastFrame } = render(
    <SearchQuotationScreen
      onBack={() => {}}
      onConfigure={onConfigure}
      dependencies={{
        loadConfig: async () => ({
          apiBaseUrl: "https://admin-api.or-gm.com",
          basePath: null,
          apiKey: null,
        }),
        search: vi.fn(),
        preview: vi.fn(),
        sync: vi.fn(),
      }}
    />
  )
  await waitForText(lastFrame, "Configuración incompleta")
  stdin.write("\r")
  expect(onConfigure).toHaveBeenCalledOnce()
})
