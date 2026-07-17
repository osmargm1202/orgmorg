import fs from "fs-extra"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { QuotationSearchResult } from "../admin-api.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.join(__dirname, "../..")
const DEFAULT_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "template")
const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]+/g
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const MAX_PROJECT_NAME_LENGTH = 120

export interface QuotationFolderPreview {
  folderName: string
  targetDir: string
  offerDir: string
  pdfPath: string
}

export interface SyncQuotationFolderInput {
  basePath: string
  quotation: QuotationSearchResult
  downloadPdf: (destination: string) => Promise<void>
  templateDir?: string
}

export function sanitizeProjectName(value: string): string {
  let result = value
    .normalize("NFKC")
    .replace(INVALID_NAME_CHARACTERS, "-")
    .replace(/\s+/g, " ")
    .trim()

  result = result
    .replace(/[. ]+$/g, "")
    .slice(0, MAX_PROJECT_NAME_LENGTH)
    .replace(/[. ]+$/g, "")

  if (!result) result = "PROYECTO"
  if (WINDOWS_RESERVED_NAME.test(result)) result = `_${result}`
  return result
}

export function getQuotationFolderPreview(
  basePath: string,
  quotation: QuotationSearchResult
): QuotationFolderPreview {
  const folderName = `${quotation.id} - ${sanitizeProjectName(quotation.projectName)}`
  const targetDir = path.join(path.resolve(basePath), folderName)
  const offerDir = path.join(targetDir, "Oferta")
  return {
    folderName,
    targetDir,
    offerDir,
    pdfPath: path.join(offerDir, `cotizacion_${quotation.id}.pdf`),
  }
}

async function assertDirectory(directory: string, label: string): Promise<void> {
  let stats
  try {
    stats = await fs.stat(directory)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`No se encontró ${label}: ${directory}`)
    }
    throw error
  }
  if (!stats.isDirectory()) {
    throw new Error(`${label} no es un directorio: ${directory}`)
  }
}

async function createTemplateDirectories(source: string, destination: string): Promise<void> {
  await fs.ensureDir(destination)
  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sourceChild = path.join(source, entry.name)
    const destinationChild = path.join(destination, entry.name)
    await createTemplateDirectories(sourceChild, destinationChild)
  }
}

async function replaceFileSafely(source: string, destination: string): Promise<void> {
  const backup = `${destination}.backup-${randomUUID()}`
  const hadDestination = await fs.pathExists(destination)
  if (hadDestination) await fs.rename(destination, backup)

  try {
    await fs.rename(source, destination)
    if (hadDestination) await fs.remove(backup)
  } catch (error) {
    await fs.remove(destination)
    if (hadDestination && (await fs.pathExists(backup))) {
      await fs.rename(backup, destination)
    }
    throw error
  }
}

export async function syncQuotationFolder(
  input: SyncQuotationFolderInput
): Promise<QuotationFolderPreview> {
  const basePath = path.resolve(input.basePath)
  const templateDir = path.resolve(input.templateDir ?? DEFAULT_TEMPLATE_DIR)
  const preview = getQuotationFolderPreview(basePath, input.quotation)
  const pdfTemp = path.join(
    basePath,
    `.orgmorg-pdf-${input.quotation.id}-${randomUUID()}.tmp`
  )
  const folderTemp = path.join(
    basePath,
    `.orgmorg-folder-${input.quotation.id}-${randomUUID()}.tmp`
  )

  await assertDirectory(templateDir, "la carpeta template")
  if (await fs.pathExists(preview.targetDir)) {
    await assertDirectory(preview.targetDir, "la carpeta de destino")
  }

  try {
    await fs.ensureDir(basePath)
    await input.downloadPdf(pdfTemp)

    if (await fs.pathExists(preview.targetDir)) {
      await createTemplateDirectories(templateDir, preview.targetDir)
      await fs.ensureDir(preview.offerDir)
      await replaceFileSafely(pdfTemp, preview.pdfPath)
    } else {
      await createTemplateDirectories(templateDir, folderTemp)
      const temporaryOfferDir = path.join(folderTemp, "Oferta")
      await fs.ensureDir(temporaryOfferDir)
      await fs.rename(
        pdfTemp,
        path.join(temporaryOfferDir, `cotizacion_${input.quotation.id}.pdf`)
      )
      await fs.rename(folderTemp, preview.targetDir)
    }

    return preview
  } finally {
    await fs.remove(pdfTemp)
    await fs.remove(folderTemp)
  }
}
