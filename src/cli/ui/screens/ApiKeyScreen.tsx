import React, { useEffect, useState } from "react"
import { Box, Text, useApp, useInput } from "ink"
import TextInput from "ink-text-input"
import {
  AdminApiClient,
  type AdminApiConfig,
  type AuthIdentity,
} from "../../../admin-api.js"
import {
  loadConfig as defaultLoadConfig,
  maskApiKey,
  saveConfig as defaultSaveConfig,
  type Config,
} from "../../../config.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

interface ApiKeyScreenProps {
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  saveConfig?: typeof defaultSaveConfig
  validateCredentials?: (config: AdminApiConfig) => Promise<AuthIdentity>
}

export function ApiKeyScreen({
  onBack,
  loadConfig = defaultLoadConfig,
  saveConfig = defaultSaveConfig,
  validateCredentials,
}: ApiKeyScreenProps) {
  const { exit } = useApp()
  const [config, setConfig] = useState<Config | null>(null)
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<"loading" | "editing" | "validating" | "done" | "error">(
    "loading"
  )
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    void loadConfig()
      .then((loaded) => {
        if (!cancelled) {
          setConfig(loaded)
          setStatus("editing")
        }
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
  }, [loadConfig])

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }
    if (key.escape && status !== "validating") onBack()
  })

  const handleSubmit = async () => {
    const apiKey = value.trim()
    if (!config || !apiKey) return
    if (!apiKey.startsWith("orgm_")) {
      setStatus("error")
      setMessage("La API key debe comenzar con orgm_.")
      return
    }

    setStatus("validating")
    try {
      const credentials = { apiBaseUrl: config.apiBaseUrl, apiKey }
      const identity = validateCredentials
        ? await validateCredentials(credentials)
        : await new AdminApiClient(credentials).validateCredentials()
      const updated = { ...config, apiKey }
      await saveConfig(updated)
      setConfig(updated)
      setValue("")
      setMessage(`API key válida para ${identity.email}.`)
      setStatus("done")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setStatus("error")
    }
  }

  if (status === "loading" || status === "validating") {
    return (
      <ScreenFrame
        title="Configurar API key"
        help={status === "loading" ? "Cargando..." : "Validando credencial..."}
      >
        <Text color="yellow">
          {status === "loading" ? "Cargando configuración..." : "Validando API key..."}
        </Text>
      </ScreenFrame>
    )
  }

  if (status === "done" || status === "error") {
    return (
      <ScreenFrame title="Configurar API key" help="Esc volver · Ctrl+C salir">
        <Text color={status === "done" ? "green" : "red"}>{message}</Text>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Configurar API key"
      help="Escribe la key y presiona Enter · Esc volver · Ctrl+C salir"
    >
      <Text>Actual: {maskApiKey(config?.apiKey ?? null)}</Text>
      <Box marginTop={1}>
        <Text color="gray">API key: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => void handleSubmit()}
          placeholder="orgm_..."
          mask="*"
        />
      </Box>
    </ScreenFrame>
  )
}
