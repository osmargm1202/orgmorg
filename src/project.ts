import {
  getProyectoById,
  updateProyectoNombre,
  type ProyectoWithCotizaciones,
} from "./db.js"
import {
  FolderCreationAfterPersistError,
  createCotizacionWithFolder,
  getCreateCotizacionPreview,
  recreateFolderFromCotizacion,
  type CreateCotizacionInput,
} from "./services/cotizaciones.js"

interface QuotationCommandParseResult {
  newName?: string
  projectId?: number
  clienteId?: number
  json: boolean
  previewOnly: boolean
}

function printQuotationUsage(message?: string): never {
  if (message) {
    console.error(message)
  }

  console.error(
    "Uso: orgmorg quotation --new <nombre> --cliente-id <id> | --project-id <id> [--preview] [--json]"
  )
  console.error("Alias: orgmorg quotation new <nombre> --cliente-id <id> | orgmorg quotation existing <id>")
  process.exit(1)
}

function formatQuotationPayload(payload: unknown, asJson: boolean): string {
  if (asJson) {
    return JSON.stringify(payload, null, 2)
  }

  if (
    payload &&
    typeof payload === "object" &&
    "numero" in payload &&
    "nombre" in payload &&
    "targetDir" in payload
  ) {
    const preview = payload as Awaited<ReturnType<typeof getCreateCotizacionPreview>>
    return [
      `Proyecto: ${preview.nombre}`,
      `Cliente: ${preview.clienteNombre} (id ${preview.clienteId})`,
      `Tipo: ${preview.existingProject ? "Existente" : "Nuevo"}`,
      `Próximo número: ${preview.numero}`,
      `Carpeta: ${preview.folderName}`,
      `Ruta: ${preview.targetDir}`,
    ].join("\n")
  }

  if (
    payload &&
    typeof payload === "object" &&
    "cotizacion" in payload &&
    "proyectoNombre" in payload &&
    "targetDir" in payload
  ) {
    const result = payload as Awaited<ReturnType<typeof createCotizacionWithFolder>>
    return [
      `Cotización ${result.cotizacion} creada para ${result.proyectoNombre}.`,
      `Cliente: id ${result.clienteId}`,
      `Carpeta creada en ${result.targetDir}`,
    ].join("\n")
  }

  return String(payload)
}

function parseQuotationCommandArgs(args: string[]): QuotationCommandParseResult {
  if (args.length === 0) {
    printQuotationUsage("Faltan opciones para `orgmorg quotation`.")
  }

  const flags = new Set<string>()
  let newName: string | undefined
  let projectId: number | undefined
  let clienteId: number | undefined

  const takeValue = (index: number, flag: string): string => {
    const value = args[index + 1]?.trim()
    if (!value) {
      printQuotationUsage(`Falta valor para ${flag}.`)
    }
    return value
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--json" || arg === "--preview") {
      flags.add(arg)
      continue
    }

    if (arg === "new") {
      const value = takeValue(index, "new")
      newName = value
      index += 1
      continue
    }

    if (arg === "existing") {
      const value = takeValue(index, "existing")
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printQuotationUsage("El id del proyecto existente debe ser un entero positivo.")
      }
      projectId = parsed
      index += 1
      continue
    }

    if (arg === "--new" || arg === "--name") {
      const value = takeValue(index, arg)
      newName = value
      index += 1
      continue
    }

    if (arg === "--project-id" || arg === "--existing") {
      const value = takeValue(index, arg)
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printQuotationUsage("El id del proyecto existente debe ser un entero positivo.")
      }
      projectId = parsed
      index += 1
      continue
    }

    if (arg === "--cliente-id" || arg === "--client-id") {
      const value = takeValue(index, arg)
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        printQuotationUsage("El id del cliente debe ser un entero positivo.")
      }
      clienteId = parsed
      index += 1
      continue
    }

    printQuotationUsage(`Opción no reconocida para quotation: ${arg}`)
  }

  if (newName && projectId) {
    printQuotationUsage("Usa solo una modalidad: proyecto nuevo o proyecto existente.")
  }

  if (!newName && !projectId) {
    printQuotationUsage("Debes indicar `--new <nombre>` o `--project-id <id>`.")
  }

  if (newName && !clienteId) {
    printQuotationUsage("Para un proyecto nuevo, debes indicar `--cliente-id <id>`.")
  }

  return {
    newName,
    projectId,
    clienteId,
    json: flags.has("--json"),
    previewOnly: flags.has("--preview"),
  }
}

async function buildQuotationInput(options: QuotationCommandParseResult): Promise<CreateCotizacionInput> {
  if (options.newName) {
    return { kind: "new", nombre: options.newName, clienteId: options.clienteId! }
  }

  const projectId = options.projectId!
  const proyecto = getProyectoById(projectId)
  if (!proyecto) {
    throw new Error(`No existe el proyecto con id ${projectId}.`)
  }

  return {
    kind: "existing",
    proyectoId: projectId,
    nombre: proyecto.nombre,
  }
}

export async function runProjectRecover(numeroArg: string): Promise<void> {
  const raw = numeroArg?.trim()
  if (!raw) {
    console.error("Uso: orgmorg project recover <numero>")
    console.error("Falta el número de cotización requerido.")
    process.exit(1)
  }
  const numero = Number(raw)
  if (!Number.isInteger(numero) || numero <= 0) {
    console.error("Debes indicar un número de cotización válido.")
    process.exit(1)
  }

  const result = await recreateFolderFromCotizacion(numero)
  console.log(`Carpeta recuperada para ${result.proyectoNombre}.`)
  console.log(`Ruta: ${result.targetDir}`)
}

function printProjectRenameUsage(message?: string): never {
  if (message) {
    console.error(message)
  }
  console.error("Uso: orgmorg project rename <id> <nuevo nombre>")
  process.exit(1)
}

export async function runProjectRename(args: string[]): Promise<void> {
  const [idArg, ...nameParts] = args
  const projectId = Number(idArg)
  const nombre = nameParts.join(" ").trim()

  if (!Number.isInteger(projectId) || projectId <= 0) {
    printProjectRenameUsage("Debes indicar un id de proyecto válido.")
  }

  if (!nombre) {
    printProjectRenameUsage("Debes indicar el nuevo nombre del proyecto.")
  }

  const result = updateProyectoNombre(projectId, nombre)
  console.log(`Proyecto ${result.id} actualizado a: ${result.nombre}`)
}

export async function runQuotationCommand(args: string[]): Promise<void> {
  try {
    const options = parseQuotationCommandArgs(args)
    const input = await buildQuotationInput(options)
    const preview = await getCreateCotizacionPreview(input)

    if (options.previewOnly) {
      console.log(formatQuotationPayload(preview, options.json))
      return
    }

    const result = await createCotizacionWithFolder(input)
    console.log(formatQuotationPayload(result, options.json))
  } catch (error) {
    if (error instanceof FolderCreationAfterPersistError) {
      if (args.includes("--json")) {
        console.error(
          JSON.stringify(
            {
              error: error.message,
              cotizacion: error.result.cotizacion,
              proyectoId: error.result.proyectoId,
              proyectoNombre: error.result.proyectoNombre,
              targetDir: error.targetDir,
              recover: `orgmorg project recover ${error.result.cotizacion}`,
            },
            null,
            2
          )
        )
      } else {
        console.error(
          `La base de datos se actualizó con la cotización ${error.result.cotizacion}, pero no se pudo crear la carpeta.`
        )
        console.error(`Error: ${error.message}`)
        console.error(`Recuperación: orgmorg project recover ${error.result.cotizacion}`)
      }
      process.exit(1)
    }

    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
