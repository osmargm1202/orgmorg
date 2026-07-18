import React, { useEffect, useState } from "react"
import {
  AdminApiClient,
  FUNCTIONAL_PERMISSIONS,
  hasPermissions,
  type AdminApiConfig,
  type AuthIdentity,
} from "../../../admin-api.js"
import {
  loadConfig as defaultLoadConfig,
  maskApiKey,
  type Config,
} from "../../../config.js"
import { MenuScreen } from "../components/MenuScreen.js"
import { ScreenFrame } from "../components/ScreenFrame.js"
import { Text } from "ink"

const METHODS = [
  { id: "config-token-env", label: "Usar ORGM_TOKEN" },
  { id: "config-token-web", label: "Iniciar sesión con Google (HTTPS)" },
]

interface AuthMethodScreenProps {
  onSelect: (screen: "config-token-env" | "config-token-web") => void
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  validateCredentials?: (config: AdminApiConfig) => Promise<AuthIdentity>
}

export function AuthMethodScreen({
  onSelect,
  onBack,
  loadConfig = defaultLoadConfig,
  validateCredentials,
}: AuthMethodScreenProps) {
  const [mode, setMode] = useState<"loading" | "configured" | "methods" | "error">(
    "loading"
  )
  const [config, setConfig] = useState<Config | null>(null)
  const [identity, setIdentity] = useState<AuthIdentity | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    void loadConfig()
      .then(async (loaded) => {
        if (cancelled) return
        setConfig(loaded)
        if (!loaded.apiKey) {
          setMode("methods")
          return
        }
        try {
          const credentials = { apiBaseUrl: loaded.apiBaseUrl, apiKey: loaded.apiKey }
          const currentIdentity = validateCredentials
            ? await validateCredentials(credentials)
            : await new AdminApiClient(credentials).validateCredentials()
          if (
            !cancelled &&
            hasPermissions(currentIdentity.permissions, FUNCTIONAL_PERMISSIONS)
          ) {
            setIdentity(currentIdentity)
            setMode("configured")
          } else if (!cancelled) {
            setMode("methods")
          }
        } catch {
          if (!cancelled) setMode("methods")
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
          setMode("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadConfig, validateCredentials])

  if (mode === "loading") {
    return (
      <ScreenFrame title="Acceso administrativo" help="Cargando...">
        <Text color="yellow">Validando acceso actual...</Text>
      </ScreenFrame>
    )
  }

  if (mode === "error") {
    return (
      <ScreenFrame title="Acceso administrativo" help="Esc volver">
        <Text color="red">{message}</Text>
      </ScreenFrame>
    )
  }

  if (mode === "configured" && config?.apiKey && identity) {
    return (
      <MenuScreen
        title="Acceso administrativo"
        help="Enter reconfigurar · Esc volver · Ctrl+C salir"
        items={[
          {
            id: "reconfigure",
            label: `Acceso configurado: ${identity.email} (${maskApiKey(config.apiKey)}) · Reconfigurar`,
          },
        ]}
        onSelect={() => setMode("methods")}
        onBack={onBack}
      />
    )
  }

  return (
    <MenuScreen
      title="Acceso administrativo"
      help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      items={METHODS}
      onSelect={(id) => onSelect(id as "config-token-env" | "config-token-web")}
      onBack={onBack}
    />
  )
}
