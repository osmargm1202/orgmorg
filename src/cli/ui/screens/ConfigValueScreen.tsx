import React, { useEffect, useState } from "react"
import fs from "fs-extra"
import { constants } from "node:fs"
import path from "node:path"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import {
  AdminApiClient,
  type AdminApiConfig,
  type AuthIdentity,
} from "../../../admin-api.js"
import {
  loadConfig as defaultLoadConfig,
  normalizeApiBaseUrl,
  saveConfig as defaultSaveConfig,
  type Config,
} from "../../../config.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

type ConfigKey = keyof Pick<Config, "apiBaseUrl" | "basePath">

export function ConfigValueScreen({
  onBack,
  configKey,
  title,
  description,
  placeholder,
  loadConfig = defaultLoadConfig,
  saveConfig = defaultSaveConfig,
  validateCredentials,
}: {
  onBack: () => void
  configKey: ConfigKey
  title: string
  description: string
  placeholder: string
  loadConfig?: typeof defaultLoadConfig
  saveConfig?: typeof defaultSaveConfig
  validateCredentials?: (config: AdminApiConfig) => Promise<AuthIdentity>
}) {
  const { exit } = useApp()
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<"editing" | "saving" | "done" | "error">(
    "editing"
  )
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    void loadConfig()
      .then((config) => {
        const current = config[configKey]
        if (!cancelled && typeof current === "string") setValue(current)
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus("error")
          setMessage(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [configKey, loadConfig])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && status !== "saving") onBack()
  })

  const handleSubmit = async () => {
    const trimmed = value.trim()
    if (!trimmed) return

    setStatus("saving")
    try {
      const config = await loadConfig()
      let normalized: string
      if (configKey === "apiBaseUrl") {
        normalized = normalizeApiBaseUrl(trimmed)
      } else {
        normalized = path.resolve(trimmed)
        await fs.ensureDir(normalized)
        await fs.access(normalized, constants.W_OK)
      }
      if (configKey === "apiBaseUrl" && config.apiKey) {
        const credentials = { apiBaseUrl: normalized, apiKey: config.apiKey }
        if (validateCredentials) await validateCredentials(credentials)
        else await new AdminApiClient(credentials).validateCredentials()
      }
      config[configKey] = normalized
      await saveConfig(config)
      setValue(normalized)
      setMessage(`Valor guardado: ${normalized}`)
      setStatus("done")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setStatus("error")
    }
  }

  if (status === "saving") {
    return (
      <ScreenFrame title={title} help="Validando y guardando configuración...">
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
    <ScreenFrame
      title={title}
      help="Escribe el valor y presiona Enter · Esc volver · Ctrl+C salir"
    >
      <Text>{description}</Text>
      <Box marginTop={1}>
        <Text color="gray">Valor: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => void handleSubmit()}
          placeholder={placeholder}
        />
      </Box>
    </ScreenFrame>
  )
}
