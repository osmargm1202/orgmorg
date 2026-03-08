import React, { useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import { getDefaultSeedJsonPath, seedDbFromJsonPath } from "../../../db-cmd.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function DbSeedScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [jsonPath, setJsonPath] = useState(getDefaultSeedJsonPath())
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
    setStatus("loading")
    setMessage("")
    try {
      const result = await seedDbFromJsonPath(jsonPath.trim() || undefined)
      setStatus("done")
      setMessage(
        `Importación completada desde ${result.resolvedPath}. Proyectos: ${result.proyectosInsertados}. Cotizaciones: ${result.cotizacionesInsertadas}.`
      )
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (status === "loading") {
    return (
      <ScreenFrame title="Poblar base de datos" help="Importando proyectos y cotizaciones...">
        <Text color="yellow">Ejecutando seed...</Text>
      </ScreenFrame>
    )
  }

  if (status === "done" || status === "error") {
    return (
      <ScreenFrame title="Poblar base de datos" help="Esc volver · Ctrl+C salir">
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Poblar base de datos"
      help="Edita la ruta si hace falta y presiona Enter · Esc volver · Ctrl+C salir"
    >
      <Text>Archivo JSON con el array `cotizaciones` para poblar proyectos y cotizaciones.</Text>
      <Box marginTop={1}>
        <Text color="gray">Ruta JSON: </Text>
        <TextInput
          value={jsonPath}
          onChange={setJsonPath}
          onSubmit={() => void handleSubmit()}
          placeholder={getDefaultSeedJsonPath()}
        />
      </Box>
    </ScreenFrame>
  )
}
