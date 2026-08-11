import React from "react"
import fs from "fs-extra"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import type { AddressInfo } from "node:net"
import { render } from "ink-testing-library"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminApiClient } from "../src/admin-api.js"
import { WebLoginScreen } from "../src/cli/ui/screens/WebLoginScreen.js"
import { getConfigPath, isConfigComplete, loadConfig, saveConfig } from "../src/config.js"
import { syncQuotationFolder } from "../src/services/project-folders.js"

const roots: string[] = []

const waitForText = async (frame: () => string | undefined, text: string) => {
  const deadline = Date.now() + 1000
  while (Date.now() < deadline) {
    if (frame()?.includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`No apareció: ${text}`)
}

afterEach(async () => {
  delete process.env.ORGMORG_CONFIG_DIR
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)))
})

describe("quotation workflow integration", () => {
  it("guarda solo API key después de pegar callback web", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-web-login-"))
    roots.push(root)
    process.env.ORGMORG_CONFIG_DIR = path.join(root, "config")
    await saveConfig({
      apiBaseUrl: "https://api.example.com",
      basePath: path.join(root, "projects"),
      apiKey: null,
    })

    const callbackUrl =
      "https://admin.example/auth/callback#access_token=jwt-integration-secret"
    const provisionApiKey = vi.fn(async () => ({
      apiKey: "orgm_integration_key",
      email: "osmar@or-gm.com",
      roleName: "CLI",
      source: "browser-jwt" as const,
    }))
    const { stdin, lastFrame } = render(
      React.createElement(WebLoginScreen, {
        onBack: () => {},
        launchLogin: async () => ({
          loginUrl: "https://api.example.com/auth/google/start",
          opened: true,
        }),
        provisionApiKey,
      })
    )

    await waitForText(lastFrame, "Enter abrir Google")
    stdin.write("\r")
    await waitForText(lastFrame, "Pega el token")
    stdin.write(callbackUrl)
    await new Promise((resolve) => setTimeout(resolve, 30))
    stdin.write("\r")
    await waitForText(lastFrame, "API key configurada")

    expect(provisionApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ token: "jwt-integration-secret" })
    )
    await expect(loadConfig()).resolves.toMatchObject({ apiKey: "orgm_integration_key" })
    const rawConfig = await fs.readFile(getConfigPath(), "utf8")
    expect(rawConfig).not.toContain("jwt-integration-secret")
    expect(rawConfig).not.toContain(callbackUrl)
  })

  it("consulta loopback, crea carpeta y actualiza PDF sin borrar archivos", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-integration-"))
    roots.push(root)
    const templateDir = path.join(root, "template")
    const basePath = path.join(root, "projects")
    process.env.ORGMORG_CONFIG_DIR = path.join(root, "config")
    await fs.ensureDir(path.join(templateDir, "Oferta"))
    await fs.ensureDir(path.join(templateDir, "Planos"))

    let pdfBody = "%PDF-v1"
    const server = http.createServer((request, response) => {
      if (request.headers.authorization !== "Bearer orgm_test") {
        response.writeHead(401).end()
        return
      }
      if (request.url === "/auth/me") {
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify({
            email: "test@or-gm.com",
            tenant_id: 1,
            exp: null,
            permisos: {},
          })
        )
        return
      }
      if (request.url === "/api/cotizaciones/search?q=torre") {
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify([
            {
              id: 593,
              id_proyecto: 8,
              fecha: "2026-07-01",
              estado: "GENERADA",
              descripcion: "Diseño",
            },
          ])
        )
        return
      }
      if (request.url === "/api/proyectos") {
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify([{ id: 8, nombre_proyecto: "Torre Central" }]))
        return
      }
      if (request.url === "/api/cotizaciones/593/pdf") {
        response.setHeader("content-type", "application/pdf")
        response.end(pdfBody)
        return
      }
      response.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

    try {
      const port = (server.address() as AddressInfo).port
      await saveConfig({
        apiBaseUrl: `http://127.0.0.1:${port}`,
        basePath,
        apiKey: "orgm_test",
      })
      const config = await loadConfig()
      expect(isConfigComplete(config)).toBe(true)
      if (!isConfigComplete(config)) throw new Error("Configuración incompleta")

      const client = new AdminApiClient(config)
      await client.validateCredentials()
      const [quotation] = await client.searchQuotationsByProjectName("torre")
      if (!quotation) throw new Error("Cotización no encontrada")
      const result = await syncQuotationFolder({
        basePath: config.basePath,
        quotation,
        templateDir,
        downloadPdf: (destination) =>
          client.downloadQuotationPdf(quotation.id, destination),
      })
      expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-v1")

      await fs.writeFile(path.join(result.targetDir, "usuario.txt"), "conservar")
      pdfBody = "%PDF-v2"
      await syncQuotationFolder({
        basePath: config.basePath,
        quotation,
        templateDir,
        downloadPdf: (destination) =>
          client.downloadQuotationPdf(quotation.id, destination),
      })
      expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-v2")
      expect(await fs.readFile(path.join(result.targetDir, "usuario.txt"), "utf8")).toBe(
        "conservar"
      )
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
})
