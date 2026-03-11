#!/usr/bin/env node

import readline from "node:readline"
import { runConfig } from "./config-cmd.js"
import { runProject, runProjectRecover } from "./project.js"
import { runOrganize } from "./organize.js"
import { runOrganizeByDate, type DateGranularity } from "./organize-by-date.js"
import { runDbSeed, runDbLast, runDbList } from "./db-cmd.js"
import { runDbInit } from "./db-init.js"
import { runMenu } from "./cli/runMenu.js"
import { getSessionStatus, logout, runOAuthLogin } from "./auth/neon.js"
import { getEffectiveSessionExpiry, hasCachedAccessToken, hasSessionToken, isLegacySession } from "./data-api.js"

const [, , cmd, sub, value, ...extraArgs] = process.argv
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

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve((answer || "").trim())
    })
  })
}

async function askYesNo(question: string): Promise<boolean> {
  while (true) {
    const answer = (await ask(`${question} (yes/no): `)).toLowerCase()
    if (["yes", "y", "si", "sí", "s"].includes(answer)) return true
    if (["no", "n"].includes(answer)) return false
    console.log("Respuesta inválida. Usa yes o no.")
  }
}

async function confirmOrganizeAction(message: string): Promise<boolean> {
  const confirmed = await askYesNo(message)
  if (!confirmed) {
    console.log("Operación cancelada.")
  }
  return confirmed
}

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

  lines.push(`${paint(stream, "orgmorg", ANSI.blue, ANSI.bold)} ${paint(stream, "CLI para cotizaciones, organización de archivos y Neon.", ANSI.gray)}`)
  lines.push("")
  lines.push(paint(stream, "Uso", ANSI.yellow, ANSI.bold))
  lines.push(`  ${paint(stream, "orgmorg <comando> [opciones]", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg help", ANSI.green)} ${paint(stream, "# muestra esta ayuda", ANSI.gray)}`)
  lines.push("")
  lines.push(paint(stream, "Sesión", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg menu", "Abre el menú interactivo Ink."))
  lines.push(formatCommand(stream, "orgmorg login", "Inicia sesión OAuth con Neon."))
  lines.push(formatCommand(stream, "orgmorg status", "Muestra la sesión activa actual."))
  lines.push(formatCommand(stream, "orgmorg logout", "Elimina la sesión local guardada."))
  lines.push("")
  lines.push(paint(stream, "Proyectos", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg project", "Crea una cotización y su carpeta de forma guiada."))
  lines.push(formatCommand(stream, "orgmorg project list [nombre]", "Lista proyectos y filtra opcionalmente por nombre."))
  lines.push(formatCommand(stream, "orgmorg project last", "Muestra el último número de cotización."))
  lines.push(formatCommand(stream, "orgmorg project recover <numero>", "Recrea la carpeta de una cotización existente."))
  lines.push("")
  lines.push(paint(stream, "Organización", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg organize", "Organiza por extensión solo el directorio actual."))
  lines.push(formatCommand(stream, "orgmorg organize-by-date year", "Agrupa por año usando mtime."))
  lines.push(formatCommand(stream, "orgmorg organize-by-date month", "Agrupa por año/mes usando mtime."))
  lines.push(formatCommand(stream, "orgmorg organize-by-date day", "Agrupa por año/mes/día usando mtime."))
  lines.push(`  ${paint(stream, "Nota:", ANSI.blue, ANSI.bold)} estos comandos solo trabajan sobre ${paint(stream, process.cwd(), ANSI.green)} y piden confirmación ${paint(stream, "yes/no", ANSI.cyan)} antes de mover archivos.`)
  lines.push("")
  lines.push(paint(stream, "Base de datos", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg db init", "Pide una URL Postgres efímera y aplica la migración inicial."))
  lines.push(formatCommand(stream, "orgmorg db seed [ruta.json]", "Importa proyectos y cotizaciones desde un JSON."))
  lines.push(formatCommand(stream, "orgmorg db last", "Muestra el último número guardado en la base."))
  lines.push(formatCommand(stream, "orgmorg db list [nombre]", "Lista proyectos visibles con filtro opcional."))
  lines.push("")
  lines.push(paint(stream, "Configuración", ANSI.yellow, ANSI.bold))
  lines.push(formatCommand(stream, "orgmorg config auth-url <url>", "Guarda la URL base de Neon Auth."))
  lines.push(formatCommand(stream, "orgmorg config api-url <url>", "Guarda la URL base de Neon Data API."))
  lines.push(formatCommand(stream, "orgmorg config oauth-provider <id>", "Guarda el proveedor OAuth, por ejemplo google."))
  lines.push(formatCommand(stream, "orgmorg config path <dir>", "Guarda un directorio base para otros flujos del CLI."))
  lines.push("")
  lines.push(paint(stream, "Ejemplos", ANSI.yellow, ANSI.bold))
  lines.push(`  ${paint(stream, "orgmorg login", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg db init", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg db seed cotizaciones_proyctos.json", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg organize", ANSI.green)}`)
  lines.push(`  ${paint(stream, "orgmorg organize-by-date month", ANSI.green)}`)
  lines.push("")
  lines.push(`${paint(stream, "Tip:", ANSI.blue, ANSI.bold)} puedes usar ${paint(stream, "orgmorg help", ANSI.cyan)} o también ${paint(stream, "orgmorg -h", ANSI.cyan)} / ${paint(stream, "orgmorg --help", ANSI.cyan)}.`)

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
  console.error("Uso: orgmorg organize")
  console.error("Organiza por extensión únicamente el directorio actual.")
  process.exit(1)
}

function isDateGranularity(candidate: string | undefined): candidate is DateGranularity {
  return candidate === "year" || candidate === "month" || candidate === "day"
}

function printOrganizeByDateUsage(message?: string): never {
  if (message) {
    console.error(message)
  }
  console.error("Uso: orgmorg organize-by-date <year|month|day>")
  console.error("Organiza por fecha usando mtime y únicamente el directorio actual.")
  console.error("Subcomandos válidos: year, month, day.")
  process.exit(1)
}

async function main(): Promise<void> {
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    printDetailedHelp("stdout", 0)
  }
  if (cmd === "menu" || !cmd) {
    if (process.stdin.isTTY) {
      await runMenu()
    } else {
      await runProject()
    }
    return
  }
  if (cmd === "config") {
    await runConfig(sub, value)
    return
  }
  if (cmd === "login") {
    const session = await runOAuthLogin()
    console.log(`Sesión iniciada como ${session.user.email ?? session.user.name ?? session.user.id}`)
    return
  }
  if (cmd === "status") {
    const session = await getSessionStatus()
    if (!session) {
      console.log("Sin sesión activa.")
      return
    }
    console.log(`Sesión activa: ${session.user.email ?? session.user.name ?? session.user.id}`)
    console.log(`Proveedor: ${session.provider}`)
    console.log(`Session token: ${hasSessionToken(session) ? "guardado" : "no disponible"}`)
    console.log(`JWT cacheado: ${hasCachedAccessToken(session) ? "disponible" : "no disponible"}`)
    console.log(`Expira JWT cacheado: ${getEffectiveSessionExpiry(session) ?? "desconocido"}`)
    if (isLegacySession(session)) {
      console.log("Modo de sesión: legacy JWT-only")
    }
    return
  }
  if (cmd === "logout") {
    await logout()
    console.log("Sesión local eliminada.")
    return
  }
  if (cmd === "project") {
    if (sub === "recover") {
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
    await runProject()
    return
  }
  if (cmd === "organize") {
    if (sub || value || extraArgs.length > 0) {
      printOrganizeUsage(
        "Sintaxis inválida: `orgmorg organize` no acepta rutas ni argumentos adicionales."
      )
    }
    const confirmed = await confirmOrganizeAction(
      `Vas a organizar por tipo el directorio actual: ${process.cwd()}`
    )
    if (!confirmed) {
      return
    }
    await runOrganize(process.cwd())
    return
  }
  if (cmd === "organize-by-date") {
    if (!sub) {
      printOrganizeByDateUsage("Falta el subcomando requerido para `organize-by-date`.")
    }
    if (!isDateGranularity(sub) || value || extraArgs.length > 0) {
      printOrganizeByDateUsage(
        "Sintaxis inválida: usa exactamente un subcomando entre `year`, `month` o `day`."
      )
    }
    const confirmed = await confirmOrganizeAction(
      `Vas a organizar por fecha (${sub}) el directorio actual: ${process.cwd()}`
    )
    if (!confirmed) {
      return
    }
    await runOrganizeByDate(process.cwd(), sub)
    return
  }
  if (cmd === "db") {
    if (sub === "init") {
      await runDbInit()
      return
    }
    if (sub === "seed") {
      await runDbSeed(value)
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
    console.error("Uso: orgmorg db init | seed [ruta.json] | last | list [nombre]")
    process.exit(1)
  }
  printDetailedHelp("stderr", 1, `Comando no reconocido: ${cmd}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
