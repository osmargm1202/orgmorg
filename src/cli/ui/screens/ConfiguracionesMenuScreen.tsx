import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "config-db-path",
    label: "Configurar ruta de base de datos",
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
