import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const SCHEMA_RELATIVE_PATH = "schema/001_init_cotizaciones_proyectos.sql"
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_FILE_PATH = path.resolve(MODULE_DIR, "..", SCHEMA_RELATIVE_PATH)

function ensureInteractiveTerminal(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("`orgmorg db init` requiere una terminal interactiva para pedir la URL de forma segura.")
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve((answer || "").trim())
    })
  })
}

function askHidden(question: string): Promise<string> {
  ensureInteractiveTerminal()

  return new Promise((resolve, reject) => {
    let value = ""
    const stdin = process.stdin
    const stdout = process.stdout
    const wasRaw = stdin.isRaw === true

    const cleanup = () => {
      stdin.off("keypress", onKeypress)
      if (!wasRaw) {
        stdin.setRawMode(false)
      }
      stdin.pause()
    }

    const onKeypress = (chunk: string, key: readline.Key) => {
      if (key.ctrl && key.name === "c") {
        cleanup()
        stdout.write("\n")
        reject(new Error("Operación cancelada."))
        return
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup()
        stdout.write("\n")
        resolve(value.trim())
        return
      }

      if (key.name === "backspace") {
        value = value.slice(0, -1)
        return
      }

      if (chunk && !key.ctrl && !key.meta) {
        value += chunk
      }
    }

    readline.emitKeypressEvents(stdin)
    stdout.write(question)
    stdin.resume()
    stdin.setRawMode(true)
    stdin.on("keypress", onKeypress)
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

function parseConnectionUrl(value: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error("La URL de Postgres no tiene un formato válido.")
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("La URL debe usar el esquema `postgres://` o `postgresql://`.")
  }

  const databaseName = url.pathname.replace(/^\/+/, "")
  if (!databaseName) {
    throw new Error("La URL debe incluir el nombre de la base de datos.")
  }

  return url
}

function describeConnectionTarget(url: URL): string {
  const databaseName = url.pathname.replace(/^\/+/, "")
  const port = url.port || "5432"
  return `${url.hostname}:${port}/${databaseName}`
}

function describeError(error: unknown, target: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`No fue posible inicializar el esquema en ${target}: ${message}`)
}

export async function runDbInit(): Promise<void> {
  ensureInteractiveTerminal()

  const rawUrl = await askHidden("URL de Postgres (entrada oculta): ")
  if (!rawUrl) {
    throw new Error("Debes ingresar una URL de Postgres.")
  }

  const parsedUrl = parseConnectionUrl(rawUrl)
  const target = describeConnectionTarget(parsedUrl)
  const confirmed = await askYesNo(
    `Se aplicará \`${SCHEMA_RELATIVE_PATH}\` sobre ${target}. Esto puede crear tablas, secuencias y funciones`
  )

  if (!confirmed) {
    console.log("Operación cancelada.")
    return
  }

  const sql = postgres(rawUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  })

  try {
    await sql.begin(async (tx) => {
      await tx.file(SCHEMA_FILE_PATH).simple()
    })

    console.log(`Esquema aplicado correctamente usando \`${SCHEMA_RELATIVE_PATH}\` en ${target}.`)
  } catch (error) {
    throw describeError(error, target)
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}
