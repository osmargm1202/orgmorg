import React, { useState, useEffect } from "react"
import { Text, useInput, useApp } from "ink"
import { getLastCotizacionNumber } from "../../../db.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function UltimoNumeroScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [loading, setLoading] = useState(true)
  const [last, setLast] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const n = await getLastCotizacionNumber()
        if (!cancelled) setLast(n)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useInput((input, key) => {
    if (key.escape) onBack()
    if (key.ctrl && input === "c") exit()
  })

  if (loading) {
    return (
      <ScreenFrame title="Último número" help="Consultando Neon Data API...">
        <Text color="yellow">Consultando...</Text>
      </ScreenFrame>
    )
  }

  if (error) {
    return (
      <ScreenFrame title="Último número" help="Esc volver · Ctrl+C salir">
        <Text color="red">{error}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Último número" help="Esc volver · Ctrl+C salir">
      <Text>
        <Text color="green">
          {last == null ? "No hay cotizaciones aún." : `Último número: ${last}`}
        </Text>
      </Text>
    </ScreenFrame>
  )
}
