import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import { recreateFolderFromCotizacion } from "../../../services/cotizaciones.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function RecrearCarpetaScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<"editing" | "loading" | "done" | "error">("editing")
  const [message, setMessage] = useState("")

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && status !== "loading") {
      onBack()
    }
  })

  const handleSubmit = async () => {
    const numero = Number(value.trim())
    if (!Number.isInteger(numero) || numero <= 0) return

    setStatus("loading")
    try {
      const result = await recreateFolderFromCotizacion(numero)
      setStatus("done")
      setMessage(`Carpeta recreada para ${result.proyectoNombre}: ${result.targetDir}`)
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (status === "loading") {
    return (
      <ScreenFrame title="Recrear carpeta" help="Recreando carpeta desde una cotización existente...">
        <Text color="yellow">Recreando carpeta...</Text>
      </ScreenFrame>
    )
  }

  if (status === "done" || status === "error") {
    return (
      <ScreenFrame title="Recrear carpeta" help="Esc volver · Ctrl+C salir">
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title="Recrear carpeta" help="Escribe el número y presiona Enter · Esc volver · Ctrl+C salir">
      <Text>Número global de cotización</Text>
      <Box marginTop={1}>
        <Text color="gray">Número: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => void handleSubmit()}
          placeholder="ej. 153"
        />
      </Box>
    </ScreenFrame>
  )
}
