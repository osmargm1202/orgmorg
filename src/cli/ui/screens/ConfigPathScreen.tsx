import React, { useState } from "react"
import { Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import path from "path"
import fs from "fs-extra"
import { loadConfig, saveConfig } from "../../../config.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

export function ConfigPathScreen({ onBack }: { onBack: () => void }) {
  const { exit } = useApp()
  const [dir, setDir] = useState("")
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  useInput((input, key) => {
    if (key.escape) {
      onBack()
      return
    }
    if (key.ctrl && input === "c") exit()
    if (status !== "idle") return
  })

  const handleSubmit = async () => {
    const value = dir.trim()
    if (!value) return
    try {
      const resolved = path.resolve(value)
      await fs.ensureDir(resolved)
      const config = await loadConfig()
      config.path = resolved
      await saveConfig(config)
      setStatus("done")
      setMessage(`Directorio base guardado: ${resolved}`)
    } catch (err) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  if (status === "done" || status === "error") {
    return (
      <ScreenFrame title="Configurar directorio base" help="Esc volver · Ctrl+C salir">
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Configurar directorio base"
      help="Escribe la ruta y presiona Enter · Esc volver · Ctrl+C salir"
    >
      <Text>Ruta donde se crearán las carpetas de proyectos</Text>
      <Box marginTop={1}>
        <Text color="gray">Directorio: </Text>
        <TextInput
          value={dir}
          onChange={setDir}
          onSubmit={handleSubmit}
          placeholder="/ruta/o . para actual"
        />
      </Box>
    </ScreenFrame>
  )
}
