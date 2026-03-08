import React, { useEffect, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import fs from "fs-extra"
import path from "path"
import { loadConfig, saveConfig, type Config } from "../../../config.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

type ConfigKey = keyof Pick<Config, "authUrl" | "apiUrl" | "path">

export function ConfigValueScreen({
  onBack,
  configKey,
  title,
  description,
  placeholder,
}: {
  onBack: () => void
  configKey: ConfigKey
  title: string
  description: string
  placeholder: string
}) {
  const { exit } = useApp()
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<"editing" | "saving" | "done" | "error">("editing")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const config = await loadConfig()
      const current = config[configKey]
      if (!cancelled && typeof current === "string") {
        setValue(current)
      }
    })().catch((error) => {
      if (!cancelled) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : String(error))
      }
    })
    return () => {
      cancelled = true
    }
  }, [configKey])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && status !== "saving") {
      onBack()
    }
  })

  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    setStatus("saving")
    try {
      const config = await loadConfig()
      if (configKey === "path") {
        const resolved = path.resolve(trimmed)
        await fs.ensureDir(resolved)
        config.path = resolved
        setValue(resolved)
      } else {
        config[configKey] = trimmed
      }

      await saveConfig(config)
      setStatus("done")
      setMessage(`Valor guardado para ${configKey}.`)
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (status === "saving") {
    return (
      <ScreenFrame title={title} help="Guardando configuración...">
        <Text color="yellow">Guardando configuración...</Text>
      </ScreenFrame>
    )
  }

  if (status === "done" || status === "error") {
    return (
      <ScreenFrame title={title} help="Esc volver · Ctrl+C salir">
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame title={title} help="Escribe el valor y presiona Enter · Esc volver · Ctrl+C salir">
      <Text>{description}</Text>
      <Box marginTop={1}>
        <Text color="gray">Valor: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} placeholder={placeholder} />
      </Box>
    </ScreenFrame>
  )
}
