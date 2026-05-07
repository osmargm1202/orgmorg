#!/usr/bin/env node

import { runConfig } from "./config-cmd.js"
import { runProjectRecover, runProjectRename, runQuotationCommand } from "./project.js"
import { runOrganize } from "./organize.js"
import { runOrganizeByDate, type DateGranularity } from "./organize-by-date.js"
import { runDbSeed, runDbLast, runDbList, runDbVerify } from "./db-cmd.js"
import { runDbInit } from "./db-init.js"
import fs from "fs-extra"
import { runMenu } from "./cli/runMenu.js"
import { CLI_VERSION } from "./version.js"
import {
  openDatabase,
  databaseExists,
  setDbPath,
  getDbPathResolution,
  describeDbPathSource,
  DB_PATH_ENV_VAR,
} from "./db.js"
import { loadConfig, getConfigPath } from "./config.js"

const cliArgs = process.argv.slice(2)
const [cmd, sub, value, ...extraArgs] = cliArgs
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
} as const

type OutputStream = "stdout" | "stderr"

function canUseColor(stream: OutputStream): boolean {
  const target = stream === "stdout" ? process.stdout : process.stderr
  return Boolean(target.isTTY && !process.env.NO_COLOR)
}

function paint(stream: OutputStream, text: string, ...codes: string[]): string {
  if (!canUseColor(stream) || codes.length === 0) return text
  return `${codes.join("")}${text}${ANSI.reset}`
}

function formatCommand(stream: OutputStream, command: string, description: string): string {
  return `  ${paint(stream, command.padEnd(40), ANSI.cyan, ANSI.bold)} ${description}`
}

function writeLines(stream: OutputStream, lines: string[]): void {
  const writer = stream === "stdout" ? console.log : console.error
  for (const line of lines) {
    writer(line)
  }
}

function buildDetailedHelp(stream: OutputStream, errorMessage?: string): string[] {
  const lines: string[] = []

  if (errorMessage) {
    lines.push(`${paint(stream, "Error:", ANSI.red, ANSI.bold)} ${errorMessage}`)
    lines.push("")
  }

  lines.push(
    `${paint(stream, "orgmorg", ANSI.blue, ANSI.bold)} ${paint(stream, `v${CLI_VERSION}`, ANSI.cyan, ANSI.bold)} ${paint(stream, "CLI para cotizaciones, organización de archivos y proyectos.", ANSI.gray)}`
  )
  lines.push("")
  lines.push(paint(stream, "Uso", ANSI.yellow, ANSI.bold))
  lines.push(`  ${paint(stream, "orgmorg <comando> [opciones]", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg help", ANSI.green)} ${paint(stream, "# muestra esta ayuda", ANSI.gray)}`)
  lines.push("")
  lines.push(paint(stream, "Principal", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg menu", "Abre el menú interactivo."))
  lines.push(
    formatCommand(
      stream,
      'orgmorg quotation --new "Proyecto" --cliente-id 1',
      "Crea una cotización para un proyecto nuevo."
    )
  )
  lines.push(
    formatCommand(
      stream,
      "orgmorg quotation --project-id 123",
      "Crea una cotización para un proyecto existente."
    )
  )
  lines.push(formatCommand(stream, "orgmorg project list [nombre]", "Lista proyectos y filtra opcionalmente por nombre."))
  lines.push(formatCommand(stream, "orgmorg project last", "Muestra el último número de cotización."))
  lines.push(formatCommand(stream, "orgmorg project recover <numero>", "Recrea la carpeta de una cotización existente."))
  lines.push(formatCommand(stream, 'orgmorg project rename 123 "Nuevo nombre"', "Renombra un proyecto existente por id."))
  lines.push("")
  lines.push(paint(stream, "Organización", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg organize --yes", "Organiza por extensión el directorio actual."))
  lines.push(formatCommand(stream, "orgmorg organize-by-date <year|month|day> --yes", "Agrupa por fecha usando mtime."))
  lines.push("")
  lines.push(paint(stream, "Base de datos", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg db init", "Crea la base de datos SQLite local con el esquema."))
  lines.push(formatCommand(stream, "orgmorg db seed [directorio]", "Importa clientes, proyectos y cotizaciones desde JSON."))
  lines.push(formatCommand(stream, "orgmorg db last", "Muestra el último número de cotización en la base."))
  lines.push(formatCommand(stream, "orgmorg db list [nombre]", "Lista proyectos con filtro opcional."))
  lines.push(formatCommand(stream, "orgmorg db verify", "Verifica mapeos de importación (clientes reusados vs creados)."))
  lines.push("")
  lines.push(paint(stream, "Configuración", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg config db-path <ruta>", "Ruta persistente de SQLite (si no hay override por entorno)."))
  lines.push(formatCommand(stream, "orgmorg config path <dir>", "Directorio base para creación de carpetas de proyectos."))
  lines.push(`  ${paint(stream, `${DB_PATH_ENV_VAR}=<ruta>`, ANSI.green)} ${paint(stream, "override temporal de db-path.", ANSI.gray)}`)
  const dbResolution = getDbPathResolution()
  lines.push(`  ${paint(stream, "DB efectiva:", ANSI.gray)} ${dbResolution.path} ${paint(stream, `(${describeDbPathSource(dbResolution.source)})`, ANSI.gray)}`)
  lines.push("")
  lines.push(paint(stream, "Ejemplos", ANSI.yellow, ANSI.bold))
  lines.push(`  ${paint(stream, "orgmorg db init", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg db seed data/", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg organize --yes", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg organize-by-date month --yes", ANSI.green)}`)
  lines.push("")
  lines.push(`${paint(stream, "Tip:", ANSI.blue, ANSI.bold)} usa ${paint(stream, "orgmorg menu", ANSI.cyan)} para operaciones guiadas.`)

  return lines
}

function printDetailedHelp(stream: OutputStream = "stdout", exitCode = 0, errorMessage?: string): never {
  writeLines(stream, buildDetailedHelp(stream, errorMessage))
  process.exit(exitCode)
}

function printOrganizeUsage(message?: string): never {
  if (message) {
    console.error(message)
  }
  console.error("Uso: orgmorg organize --yes")
  console.error("Organiza por extensión el directorio actual. Requiere --yes para confirmar.")
  process.exit(1)
}

function isDateGranularity(candidate: string | undefined): candidate is DateGranularity {
  return candidate === "year" || candidate === "month" || candidate === "day"
}

function printOrganizeByDateUsage(message?: string): never {
  if (message) {
    console.error(message)
  }
  console.error("Uso: orgmorg organize-by-date <year|month|day> --yes")
  console.error("Organiza por fecha usando mtime y el directorio actual.")
  process.exit(1)
}

/**
 * Ensure the database is available. If missing, fail with a clear error
 * pointing the user to `orgmorg db init` or `orgmorg menu`.
 * No interactive prompts in non-menu paths.
 */
async function ensureDbAvailable(): Promise<void> {
  if (databaseExists()) {
    openDatabase()
    return
  }

  const resolution = getDbPathResolution()
  console.error(
    `La base de datos no existe en ${resolution.path} (${describeDbPathSource(resolution.source)}).\n` +
    `Ejecuta 'orgmorg db init' para crearla, o usa 'orgmorg menu' para operaciones guiadas.`
  )
  process.exit(1)
}

// Commands that do NOT require the database to exist
const NO_DB_COMMANDS = new Set([
  "help", "-h", "--help",
  "config",
  "organize", "organize-by-date",
  "version",
])

// Commands that CREATE the database (bootstrap commands exempt from ensureDbAvailable)
const BOOTSTRAP_COMMANDS = new Set(["db"])

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function isBootstrapCommand(): boolean {
  if (BOOTSTRAP_COMMANDS.has(cmd ?? "")) {
    return sub === "init" || sub === undefined
  }
  return false
}

async function main(): Promise<void> {
  // Load config first and set the DB path for all db.ts operations
  const config = await loadConfig()
  const hasPersistentConfig = await fs.pathExists(getConfigPath())
  setDbPath(hasPersistentConfig ? config.dbPath : undefined)

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    printDetailedHelp("stdout", 0)
  }

  // Config doesn't need DB
  if (cmd === "config") {
    await runConfig(sub, value)
    return
  }

  // Organize commands — strict flag-driven, no prompts
  if (cmd === "organize") {
    if (!hasFlag(cliArgs, "--yes")) {
      printOrganizeUsage("Falta el flag requerido --yes para confirmar la operación.")
    }
    if (sub || (value && value !== "--yes") || extraArgs.filter(a => a !== "--yes").length > 0) {
      printOrganizeUsage(
        "Sintaxis inválida: `orgmorg organize --yes` no acepta rutas ni argumentos adicionales."
      )
    }
    await runOrganize(process.cwd())
    return
  }
  if (cmd === "organize-by-date") {
    if (!sub) {
      printOrganizeByDateUsage("Falta el subcomando requerido para `organize-by-date`.")
    }
    if (!isDateGranularity(sub)) {
      printOrganizeByDateUsage(
        "Sintaxis inválida: usa un subcomando entre `year`, `month` o `day`."
      )
    }
    if (!hasFlag(cliArgs, "--yes")) {
      printOrganizeByDateUsage("Falta el flag requerido --yes para confirmar la operación.")
    }
    await runOrganizeByDate(process.cwd(), sub)
    return
  }

  // Bootstrap commands (db init) run BEFORE the DB-exists guard
  if (cmd === "db" && sub === "init") {
    await runDbInit()
    return
  }

  // All other DB-using commands require the database to exist
  if (!NO_DB_COMMANDS.has(cmd ?? "")) {
    await ensureDbAvailable()
  }

  if (cmd === "menu" || !cmd) {
    if (process.stdin.isTTY) {
      await runMenu()
    } else {
      console.error("El menú interactivo requiere una terminal TTY.")
      console.error("Usa orgmorg help para ver los comandos disponibles.")
      process.exit(1)
    }
    return
  }

  if (cmd === "project") {
    if (sub === "rename") {
      await runProjectRename([value, ...extraArgs].filter((item): item is string => Boolean(item)))
      return
    }
    if (sub === "recover") {
      if (!value) {
        console.error("Uso: orgmorg project recover <numero>")
        console.error("Falta el número de cotización requerido.")
        process.exit(1)
      }
      await runProjectRecover(value)
      return
    }
    if (sub === "list") {
      await runDbList(value)
      return
    }
    if (sub === "last") {
      await runDbLast()
      return
    }
    console.error("Uso: orgmorg project list|last|recover|rename [opciones]")
    console.error("Para crear cotizaciones interactivamente, usa: orgmorg menu")
    console.error("Para creación directa: orgmorg quotation --new <nombre> --cliente-id <id>")
    process.exit(1)
  }
  if (cmd === "quotation") {
    await runQuotationCommand(cliArgs.slice(1))
    return
  }

  if (cmd === "db") {
    if (sub === "seed") {
      await runDbSeed(value, false)
      return
    }
    if (sub === "last") {
      await runDbLast()
      return
    }
    if (sub === "list" || sub === "proyectos") {
      await runDbList(value)
      return
    }
    if (sub === "verify") {
      await runDbVerify()
      return
    }
    console.error("Uso: orgmorg db init | seed [directorio] | last | list [nombre] | verify")
    process.exit(1)
  }
  printDetailedHelp("stderr", 1, `Comando no reconocido: ${cmd}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
