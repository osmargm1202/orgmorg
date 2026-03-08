import readline from "readline"
import { listProyectosWithDiagnostics, type ProyectoWithCotizaciones } from "./db.js"
import {
  FolderCreationAfterPersistError,
  createCotizacionWithFolder,
  getCreateCotizacionPreview,
  recreateFolderFromCotizacion,
  type CreateCotizacionInput,
} from "./services/cotizaciones.js"

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve((answer || "").trim())
    })
  })
}

function askWithInterface(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve((answer || "").trim()))
  })
}

async function askYesNo(rl: readline.Interface, question: string): Promise<boolean> {
  while (true) {
    const answer = (await askWithInterface(rl, `${question} (yes/no): `)).toLowerCase()
    if (["yes", "y", "si", "sí", "s"].includes(answer)) return true
    if (["no", "n"].includes(answer)) return false
    console.log("Respuesta inválida. Usa yes o no.")
  }
}

async function askMenuOption(
  rl: readline.Interface,
  title: string,
  options: string[]
): Promise<number> {
  while (true) {
    console.log(`\n${title}`)
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option}`)
    })
    const raw = await askWithInterface(rl, "Selecciona una opción: ")
    const selected = Number(raw)
    if (Number.isInteger(selected) && selected >= 1 && selected <= options.length) {
      return selected - 1
    }
    console.log("Opción inválida.")
  }
}

async function searchExistingProject(
  rl: readline.Interface
): Promise<{ kind: "new" } | { kind: "existing"; proyecto: ProyectoWithCotizaciones }> {
  while (true) {
    const term = await askWithInterface(rl, "\nNombre del proyecto a buscar: ")
    if (!term) {
      console.log("Debes escribir un término de búsqueda.")
      continue
    }

    const result = await listProyectosWithDiagnostics(term)
    const results = result.proyectos
    if (results.length === 0 && result.diagnostic) {
      console.log(result.diagnostic.message)
    }
    const options = [
      "Realizar una nueva búsqueda",
      "Crear un proyecto nuevo",
      ...results.map(
        (project) =>
          `${project.nombre} · id ${project.id} · cotizaciones: ${
            project.cotizaciones.join(", ") || "—"
          }`
      ),
    ]

    const selected = await askMenuOption(
      rl,
      `Resultados para “${term}”`,
      options.length > 2 ? options : [...options, "Sin resultados"]
    )

    if (selected === 0) continue
    if (selected === 1) return { kind: "new" }

    const project = results[selected - 2]
    if (!project) {
      console.log("No hay resultados para seleccionar. Intenta otra búsqueda.")
      continue
    }

    return { kind: "existing", proyecto: project }
  }
}

async function resolveProjectInput(rl: readline.Interface): Promise<CreateCotizacionInput> {
  const mode = await askMenuOption(rl, "Tipo de proyecto", [
    "Proyecto nuevo",
    "Cotización para proyecto existente",
  ])

  if (mode === 0) {
    const nombre = await askWithInterface(rl, "Nombre del proyecto nuevo: ")
    return { kind: "new", nombre }
  }

  const result = await searchExistingProject(rl)
  if (result.kind === "new") {
    const nombre = await askWithInterface(rl, "Nombre del proyecto nuevo: ")
    return { kind: "new", nombre }
  }

  return {
    kind: "existing",
    proyectoId: result.proyecto.id,
    nombre: result.proyecto.nombre,
  }
}

export async function runProject(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    const input = await resolveProjectInput(rl)
    const preview = await getCreateCotizacionPreview(input)

    console.log("\nResumen")
    console.log(`  Proyecto: ${preview.nombre}`)
    console.log(`  Tipo: ${preview.existingProject ? "Existente" : "Nuevo"}`)
    console.log(`  Próximo número: ${preview.numero}`)
    console.log(`  Carpeta: ${preview.folderName}`)
    console.log(`  Ruta: ${preview.targetDir}`)

    const confirmed = await askYesNo(rl, "¿Confirmas la creación de la cotización y la carpeta?")
    if (!confirmed) {
      console.log("Operación cancelada.")
      return
    }

    const result = await createCotizacionWithFolder(input)
    console.log(`Cotización ${result.cotizacion} creada para ${result.proyectoNombre}.`)
    console.log(`Carpeta creada en ${result.targetDir}`)
  } catch (error) {
    if (error instanceof FolderCreationAfterPersistError) {
      console.error(
        `La base de datos se actualizó con la cotización ${error.result.cotizacion}, pero no se pudo crear la carpeta.`
      )
      console.error(`Error: ${error.message}`)
      console.error(`Recuperación: orgmorg project recover ${error.result.cotizacion}`)
      process.exit(1)
    }

    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    rl.close()
  }
}

export async function runProjectRecover(numeroArg?: string): Promise<void> {
  const raw = numeroArg?.trim() || (await ask("Número de cotización a recuperar: "))
  const numero = Number(raw)
  if (!Number.isInteger(numero) || numero <= 0) {
    console.error("Debes indicar un número de cotización válido.")
    process.exit(1)
  }

  const result = await recreateFolderFromCotizacion(numero)
  console.log(`Carpeta recuperada para ${result.proyectoNombre}.`)
  console.log(`Ruta: ${result.targetDir}`)
}
