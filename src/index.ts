#!/usr/bin/env node

import { runMenu } from "./cli/runMenu.js"
import { CLI_VERSION } from "./version.js"

const [command] = process.argv.slice(2)

const HELP = `orgmorg v${CLI_VERSION}
Buscar cotizaciones por nombre de proyecto y crear sus carpetas.

Uso:
  orgmorg
  orgmorg menu
  orgmorg --help
  orgmorg --version
`

async function main(): Promise<void> {
  if (["help", "-h", "--help"].includes(command ?? "")) {
    process.stdout.write(HELP)
    return
  }

  if (["version", "-v", "--version"].includes(command ?? "")) {
    process.stdout.write(`${CLI_VERSION}\n`)
    return
  }

  if (command && command !== "menu") {
    process.stderr.write(`Comando no reconocido: ${command}\nUsa orgmorg --help.\n`)
    process.exitCode = 1
    return
  }

  if (!process.stdin.isTTY) {
    process.stderr.write("El menú interactivo requiere una terminal TTY.\n")
    process.exitCode = 1
    return
  }

  await runMenu()
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
