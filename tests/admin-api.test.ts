import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminApiClient, AdminApiError } from "../src/admin-api.js"

const config = {
  apiBaseUrl: "https://admin-api.or-gm.com",
  apiKey: "orgm_test_key",
}

const temporary: string[] = []
afterEach(async () => Promise.all(temporary.splice(0).map((item) => fs.remove(item))))

describe("AdminApiClient", () => {
  it("valida API key con Bearer", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer orgm_test_key")
      return Response.json({
        email: "osmar@or-gm.com",
        tenant_id: 1,
        exp: null,
        permisos: {},
      })
    })
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
    await expect(client.validateCredentials()).resolves.toMatchObject({ tenantId: 1 })
  })

  it("deduplica proyectos, filtra solo por nombre y ordena ID descendente", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === "/api/cotizaciones/search") {
        expect(url.searchParams.get("q")).toBe("torre")
        return Response.json([
          {
            id: 10,
            id_proyecto: 4,
            fecha: "2026-01-01",
            estado: "GENERADA",
            descripcion: "A",
          },
          {
            id: 12,
            id_proyecto: 4,
            fecha: "2026-02-01",
            estado: "APROBADA",
            descripcion: "B",
          },
          {
            id: 11,
            id_proyecto: 9,
            fecha: "2026-03-01",
            estado: "GENERADA",
            descripcion: "Cliente Torre",
          },
        ])
      }
      if (url.pathname === "/api/proyectos/4") {
        return Response.json({ id: 4, nombre_proyecto: "Tórre Central" })
      }
      if (url.pathname === "/api/proyectos/9") {
        return Response.json({ id: 9, nombre_proyecto: "Nave Industrial" })
      }
      throw new Error(`URL inesperada: ${url}`)
    })
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
    await expect(client.searchQuotationsByProjectName("torre")).resolves.toEqual([
      expect.objectContaining({ id: 12, projectName: "Tórre Central" }),
      expect.objectContaining({ id: 10, projectName: "Tórre Central" }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("rechaza respuesta no PDF y no deja destino", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-pdf-"))
    temporary.push(dir)
    const destination = path.join(dir, "quote.tmp")
    const client = new AdminApiClient(config, {
      fetch: async () => new Response("error", { headers: { "content-type": "text/html" } }),
      sleep: async () => {},
    })
    await expect(client.downloadQuotationPdf(593, destination)).rejects.toBeInstanceOf(
      AdminApiError
    )
    await expect(fs.pathExists(destination)).resolves.toBe(false)
  })

  it("reintenta 429 con pausas exactas", async () => {
    const sleep = vi.fn(async () => {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ email: "a@b.com", tenant_id: 1, exp: null, permisos: {} })
      )
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep })
    await client.validateCredentials()
    expect(sleep.mock.calls).toEqual([[500], [1500]])
  })

  it("no reintenta 403", async () => {
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }))
    const client = new AdminApiClient(config, { fetch: fetchMock, sleep: async () => {} })
    await expect(client.validateCredentials()).rejects.toMatchObject({ kind: "permission" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
