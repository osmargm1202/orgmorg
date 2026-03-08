import React, { useEffect, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import { getSessionStatus } from "../../../auth/neon.js"
import { type StoredSession, getSessionPath, loadConfig } from "../../../config.js"
import { getEffectiveSessionExpiry, isSessionExpired } from "../../../data-api.js"
import { ACCENT_COLOR, ScreenFrame } from "../components/ScreenFrame.js"

function formatExpiry(value: number | null): string {
  if (value == null) return "desconocido"
  const asDate = new Date(value > 10_000_000_000 ? value : value * 1000)
  return asDate.toISOString()
}

export function AuthStatusScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [session, setSession] = useState<StoredSession | null>(null)
  const [configSummary, setConfigSummary] = useState<{ authUrl: string; apiUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [storedSession, config] = await Promise.all([getSessionStatus(), loadConfig()])
        if (cancelled) return
        setSession(storedSession)
        setConfigSummary({
          authUrl: config.authUrl,
          apiUrl: config.apiUrl,
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape) onBack()
  })

  return (
    <ScreenFrame title="Estado de sesión" help="Esc volver · Ctrl+C salir">
      {error ? <Text color="red">{error}</Text> : null}
      {!error && !session ? <Text color="yellow">No hay sesión activa.</Text> : null}
      {!error && session ? (
        <Box flexDirection="column">
          <Text>Usuario: {session.user.email ?? session.user.name ?? session.user.id}</Text>
          <Text>Proveedor: {session.provider}</Text>
          <Text>Expira: {formatExpiry(getEffectiveSessionExpiry(session))}</Text>
          <Text color={isSessionExpired(session) ? "yellow" : "green"}>
            Estado: {isSessionExpired(session) ? "Sesión expirada, inicia sesión de nuevo." : "Sesión lista para usar."}
          </Text>
          <Text>Sesión local: {getSessionPath()}</Text>
          <Text color="gray">
            Nota: este repo solo inicia login social OAuth. Si Neon muestra fallos de sign-up/sign-in,
            normalmente vienen de la configuración o políticas externas de Neon Auth.
          </Text>
        </Box>
      ) : null}
      {configSummary ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={ACCENT_COLOR}>Neon</Text>
          <Text>Auth URL: {configSummary.authUrl}</Text>
          <Text>API URL: {configSummary.apiUrl}</Text>
        </Box>
      ) : null}
    </ScreenFrame>
  )
}
