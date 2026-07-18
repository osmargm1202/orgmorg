import open from "open"

export type OpenBrowser = (url: string) => Promise<void>

export function buildWebLoginUrl(apiBaseUrl: string): string {
  return new URL("/auth/google/start", `${apiBaseUrl.replace(/\/+$/, "")}/`).toString()
}

export function extractAccessToken(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("Pega el token o la URL del callback.")
  if (!trimmed.includes("://")) return trimmed

  let callback: URL
  try {
    callback = new URL(trimmed)
  } catch {
    throw new Error("La URL del callback no es válida.")
  }

  const fragment = new URLSearchParams(callback.hash.replace(/^#/, ""))
  const token = fragment.get("access_token") ?? callback.searchParams.get("access_token")
  if (!token?.trim()) throw new Error("El callback no contiene access_token.")
  return token.trim()
}

export async function launchWebLogin(
  apiBaseUrl: string,
  openBrowser: OpenBrowser = async (url) => {
    await open(url)
  }
): Promise<{ loginUrl: string; opened: boolean }> {
  const loginUrl = buildWebLoginUrl(apiBaseUrl)
  try {
    await openBrowser(loginUrl)
    return { loginUrl, opened: true }
  } catch {
    return { loginUrl, opened: false }
  }
}
