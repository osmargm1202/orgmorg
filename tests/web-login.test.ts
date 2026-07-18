import { describe, expect, it, vi } from "vitest"
import {
  buildWebLoginUrl,
  extractAccessToken,
  launchWebLogin,
} from "../src/services/web-login.js"

describe("web login", () => {
  it("construye login desde único endpoint configurado", () => {
    expect(buildWebLoginUrl("https://api.example.com/")).toBe(
      "https://api.example.com/auth/google/start"
    )
  })

  it.each([
    ["  jwt-directo  ", "jwt-directo"],
    ["https://admin.example/auth/callback#access_token=jwt-fragmento", "jwt-fragmento"],
    ["https://admin.example/auth/callback?access_token=jwt-query", "jwt-query"],
  ])("extrae token sin devolver entrada completa", (value, expected) => {
    expect(extractAccessToken(value)).toBe(expected)
  })

  it("rechaza vacío y callback sin token sin filtrar URL", () => {
    expect(() => extractAccessToken(" ")).toThrow("Pega el token")
    const callback = "https://admin.example/auth/callback#otro=secreto"
    expect(() => extractAccessToken(callback)).toThrow("access_token")
    try {
      extractAccessToken(callback)
    } catch (error) {
      expect(String(error)).not.toContain(callback)
    }
  })

  it("devuelve URL aunque navegador falle", async () => {
    const openBrowser = vi.fn(async () => {
      throw new Error("sin navegador")
    })
    await expect(launchWebLogin("https://api.example.com", openBrowser)).resolves.toEqual({
      loginUrl: "https://api.example.com/auth/google/start",
      opened: false,
    })
  })
})
