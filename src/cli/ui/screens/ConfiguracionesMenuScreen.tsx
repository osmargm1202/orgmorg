import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "auth-login",
    label: "Iniciar sesión OAuth",
    hint: "Abre el navegador y guarda la sesión local",
  },
  {
    id: "auth-status",
    label: "Ver estado de sesión",
  },
  {
    id: "auth-logout",
    label: "Cerrar sesión local",
  },
  {
    id: "config-auth-url",
    label: "Configurar Auth URL",
  },
  {
    id: "config-api-url",
    label: "Configurar API URL",
  },
  {
    id: "config-path",
    label: "Configurar directorio base",
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
