import React, { useEffect, useState } from "react"
import { Text, useApp, useInput } from "ink"
import { logout } from "../../../auth/neon.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function AuthLogoutScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [message, setMessage] = useState("Cerrando sesión local...")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await logout()
        if (!cancelled) {
          setMessage("Sesión local eliminada.")
        }
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
    <ScreenFrame title="Cerrar sesión" help="Esc volver · Ctrl+C salir">
      <Text color={error ? "red" : "green"}>{error ?? message}</Text>
    </ScreenFrame>
  )
}
