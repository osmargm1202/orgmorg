import React, { useCallback, useEffect, useRef, useState } from "react"
import { Box, Text, useApp, useInput, type Key } from "ink"
import TextInput from "ink-text-input"
import { AdminApiClient } from "../../../admin-api.js"
import {
  loadConfig as defaultLoadConfig,
  maskApiKey,
  saveConfig as defaultSaveConfig,
  type Config,
} from "../../../config.js"
import {
  provisionApiKeyFromToken,
  type ProvisionApiKeyInput,
  type TokenLoginResult,
} from "../../../services/token-login.js"
import {
  extractAccessToken,
  launchWebLogin,
} from "../../../services/web-login.js"
import { ScreenFrame } from "../components/ScreenFrame.js"

type Status = "loading" | "ready" | "opening" | "input" | "working" | "done" | "error"

interface WebLoginScreenProps {
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  saveConfig?: typeof defaultSaveConfig
  launchLogin?: typeof launchWebLogin
  provisionApiKey?: (input: ProvisionApiKeyInput) => Promise<TokenLoginResult>
}

export function WebLoginScreen({
  onBack,
  loadConfig = defaultLoadConfig,
  saveConfig = defaultSaveConfig,
  launchLogin = launchWebLogin,
  provisionApiKey = provisionApiKeyFromToken,
}: WebLoginScreenProps) {
  const { exit } = useApp()
  const [config, setConfig] = useState<Config | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [inputReady, setInputReady] = useState(false)
  const [value, setValue] = useState("")
  const [loginUrl, setLoginUrl] = useState("")
  const [browserOpened, setBrowserOpened] = useState(true)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<TokenLoginResult | null>(null)
  const statusRef = useRef(status)
  const inputReadyRef = useRef(inputReady)
  const onBackRef = useRef(onBack)
  const exitRef = useRef(exit)
  const startRef = useRef<() => Promise<void>>(async () => {})
  statusRef.current = status
  inputReadyRef.current = inputReady
  onBackRef.current = onBack
  exitRef.current = exit

  useEffect(() => {
    let cancelled = false
    void loadConfig()
      .then((loaded) => {
        if (!cancelled) {
          setConfig(loaded)
          setStatus("ready")
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
          setStatus("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadConfig])

  useEffect(() => {
    if (status !== "ready") {
      setInputReady(false)
      return
    }
    const timer = setTimeout(() => setInputReady(true), 50)
    return () => clearTimeout(timer)
  }, [status])

  const handleStart = async () => {
    if (!config) return
    setStatus("opening")
    try {
      const launch = await launchLogin(config.apiBaseUrl)
      setLoginUrl(launch.loginUrl)
      setBrowserOpened(launch.opened)
      setStatus("input")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setStatus("error")
    }
  }
  startRef.current = handleStart

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.ctrl && input === "c") {
      exitRef.current()
      return
    }
    if (key.escape && !["opening", "working"].includes(statusRef.current)) {
      onBackRef.current()
      return
    }
    if (key.return && statusRef.current === "ready" && inputReadyRef.current) {
      void startRef.current()
    }
  }, [])
  useInput(handleInput)

  const handleSubmit = async () => {
    if (!config) return
    let token: string
    try {
      token = extractAccessToken(value)
    } catch (error) {
      setValue("")
      setMessage(error instanceof Error ? error.message : String(error))
      setStatus("error")
      return
    }

    setValue("")
    setStatus("working")
    try {
      const next = await provisionApiKey({
        token,
        source: "browser-jwt",
        createClient: (credential) =>
          new AdminApiClient({ apiBaseUrl: config.apiBaseUrl, apiKey: credential }),
      })
      const updated = { ...config, apiKey: next.apiKey }
      await saveConfig(updated)
      setConfig(updated)
      setResult(next)
      setStatus("done")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      setStatus("error")
    }
  }

  if (status === "loading" || status === "opening" || status === "working") {
    const text =
      status === "loading"
        ? "Cargando configuración..."
        : status === "opening"
          ? "Abriendo login de Google..."
          : "Validando y creando API key..."
    return (
      <ScreenFrame title="Login web HTTPS" help="Espera...">
        <Text color="yellow">{text}</Text>
      </ScreenFrame>
    )
  }

  if (status === "done" && result) {
    return (
      <ScreenFrame title="API key configurada" help="Esc volver · Ctrl+C salir">
        <Text color="green">Acceso configurado para {result.email}.</Text>
        <Text>API key: {maskApiKey(result.apiKey)}</Text>
        {result.roleName ? <Text>Rol: {result.roleName}</Text> : null}
      </ScreenFrame>
    )
  }

  if (status === "error") {
    return (
      <ScreenFrame title="No se pudo configurar acceso" help="Esc volver · Ctrl+C salir">
        <Text color="red">{message}</Text>
      </ScreenFrame>
    )
  }

  if (status === "input") {
    return (
      <ScreenFrame
        title="Login web HTTPS"
        help="Pega el token y presiona Enter · Esc volver · Ctrl+C salir"
      >
        <Text>Login: {loginUrl}</Text>
        <Text color={browserOpened ? "green" : "yellow"}>
          {browserOpened
            ? "Completa el login en el navegador."
            : "El navegador no abrió. Abre manualmente la URL indicada."}
        </Text>
        <Text>Pega el token o la URL completa del callback.</Text>
        <Box marginTop={1}>
          <Text color="gray">Token/callback: </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={() => void handleSubmit()}
            placeholder="Pega el token o callback"
            mask="*"
          />
        </Box>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Login web HTTPS"
      help={inputReady ? "Enter abrir Google · Esc volver · Ctrl+C salir" : "Preparando..."}
    >
      <Text>Endpoint: {config?.apiBaseUrl}</Text>
      <Text>{inputReady ? "Se abrirá el login Google existente." : "Preparando login..."}</Text>
    </ScreenFrame>
  )
}
