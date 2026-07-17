import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "search-quotation",
    label: "Buscar cotización",
  },
  {
    id: "settings-menu",
    label: "Configuración",
  },
  {
    id: "exit",
    label: "Salir",
  },
]

export function MainMenuScreen({
  onSelect,
}: {
  onSelect: (screen: string) => void
}) {
  return (
    <MenuScreen
      title="Menú principal"
      help="↑/↓ mover · Enter elegir · Ctrl+C salir"
      items={OPCIONES}
      onSelect={onSelect}
    />
  )
}
