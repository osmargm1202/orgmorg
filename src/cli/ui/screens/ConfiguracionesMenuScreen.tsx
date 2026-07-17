import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "config-token-login",
    label: "Iniciar sesión / Obtener API key",
  },
  {
    id: "config-api-url",
    label: "Endpoint administrativo",
  },
  {
    id: "config-base-path",
    label: "Carpeta base",
  },
  {
    id: "config-api-key",
    label: "API key manual",
  },
]

export function ConfiguracionesMenuScreen({
  onSelect,
  onBack,
}: {
  onSelect: (id: string) => void
  onBack: () => void
}) {
  return (
    <MenuScreen
      title="Configuración"
      help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      items={OPCIONES}
      onSelect={onSelect}
      onBack={onBack}
    />
  )
}
