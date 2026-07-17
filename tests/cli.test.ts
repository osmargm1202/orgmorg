import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "fs-extra"
import { beforeAll, describe, expect, it } from "vitest"

const exec = promisify(execFile)

beforeAll(async () => {
  await exec("npm", ["run", "build"])
})

describe("CLI mínimo", () => {
  it("muestra ayuda nueva", async () => {
    const { stdout } = await exec(process.execPath, ["dist/index.js", "--help"])
    expect(stdout).toContain("Buscar cotizaciones por nombre de proyecto")
    expect(stdout).not.toContain("organize")
    expect(stdout).not.toContain("db seed")
  })

  it("rechaza comando retirado", async () => {
    await expect(exec(process.execPath, ["dist/index.js", "db", "seed"])).rejects.toMatchObject({
      stderr: expect.stringContaining("Comando no reconocido"),
    })
  })

  it("no conserva artefactos compilados de funciones retiradas", async () => {
    await expect(fs.pathExists("dist/db.js")).resolves.toBe(false)
    await expect(fs.pathExists("dist/organize.js")).resolves.toBe(false)
    await expect(fs.pathExists("dist/services/cotizaciones.js")).resolves.toBe(false)
  })
})
