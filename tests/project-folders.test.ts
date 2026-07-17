import fs from "fs-extra"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  getQuotationFolderPreview,
  sanitizeProjectName,
  syncQuotationFolder,
} from "../src/services/project-folders.js"

const roots: string[] = []
const makeRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "orgmorg-folders-"))
  roots.push(root)
  return root
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.remove(root))))

const quotation = {
  id: 593,
  projectId: 8,
  projectName: "Torre / Central",
  date: "2026-01-01",
  status: "GENERADA",
  description: "",
}

describe("project folders", () => {
  it("sanea nombre y calcula destino", () => {
    expect(sanitizeProjectName(" CON: Torre / Central. ")).toBe("CON- Torre - Central")
    expect(getQuotationFolderPreview("/proyectos", quotation).folderName).toBe(
      "593 - Torre - Central"
    )
  })

  it("crea estructura nueva y PDF sin gitkeep", async () => {
    const root = await makeRoot()
    const template = path.join(root, "template")
    const basePath = path.join(root, "projects")
    await fs.ensureDir(path.join(template, "Oferta"))
    await fs.ensureDir(path.join(template, "Planos"))
    await fs.writeFile(path.join(template, "Oferta", ".gitkeep"), "")
    const result = await syncQuotationFolder({
      basePath,
      quotation,
      templateDir: template,
      downloadPdf: async (destination) => fs.writeFile(destination, "%PDF-test"),
    })
    expect(await fs.readFile(result.pdfPath, "utf8")).toBe("%PDF-test")
    expect(await fs.pathExists(path.join(result.targetDir, "Planos"))).toBe(true)
    expect(await fs.pathExists(path.join(result.targetDir, "Oferta", ".gitkeep"))).toBe(false)
  })

  it("completa existente sin borrar archivos y reemplaza PDF", async () => {
    const root = await makeRoot()
    const template = path.join(root, "template")
    const basePath = path.join(root, "projects")
    const preview = getQuotationFolderPreview(basePath, quotation)
    await fs.ensureDir(path.join(template, "Oferta"))
    await fs.ensureDir(path.join(template, "Memorias"))
    await fs.ensureDir(preview.offerDir)
    await fs.writeFile(path.join(preview.targetDir, "usuario.txt"), "conservar")
    await fs.writeFile(preview.pdfPath, "viejo")
    await syncQuotationFolder({
      basePath,
      quotation,
      templateDir: template,
      downloadPdf: async (destination) => fs.writeFile(destination, "nuevo"),
    })
    expect(await fs.readFile(path.join(preview.targetDir, "usuario.txt"), "utf8")).toBe(
      "conservar"
    )
    expect(await fs.readFile(preview.pdfPath, "utf8")).toBe("nuevo")
    expect(await fs.pathExists(path.join(preview.targetDir, "Memorias"))).toBe(true)
  })

  it("no deja carpeta final ni temporales si descarga falla", async () => {
    const root = await makeRoot()
    const template = path.join(root, "template")
    const basePath = path.join(root, "projects")
    await fs.ensureDir(path.join(template, "Oferta"))
    await expect(
      syncQuotationFolder({
        basePath,
        quotation,
        templateDir: template,
        downloadPdf: async () => {
          throw new Error("red caída")
        },
      })
    ).rejects.toThrow("red caída")
    expect(await fs.readdir(basePath)).toEqual([])
  })
})
