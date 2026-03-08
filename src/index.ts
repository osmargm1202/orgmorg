#!/usr/bin/env node

import { runConfig } from "./config-cmd.js"
import { runProject, runProjectRecover } from "./project.js"
import { runOrganize } from "./organize.js"
import { runOrganizeByDate } from "./organize-by-date.js"
import { runDbSeed, runDbLast, runDbList } from "./db-cmd.js"
import { runDbInit } from "./db-init.js"
import { runMenu } from "./cli/runMenu.js"
import { loadConfig } from "./config.js"
import { getSessionStatus, logout, runOAuthLogin } from "./auth/neon.js"

const [, , cmd, sub, value] = process.argv

async function main(): Promise<void> {
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
    console.log(`Expira: ${session.expiresAt ?? "desconocido"}`)
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
    const config = await loadConfig()
    const dir = sub ? sub : (config.path || process.cwd())
    await runOrganize(dir)
    return
  }
  if (cmd === "organize-by-date") {
    const config = await loadConfig()
    const dir = sub ? sub : (config.path || process.cwd())
    await runOrganizeByDate(dir)
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
  console.error("Comandos: menu, login, status, logout, config, project, organize, organize-by-date, db")
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
