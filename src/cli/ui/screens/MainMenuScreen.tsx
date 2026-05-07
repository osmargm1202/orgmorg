import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "crear-cotizacion",
    label: "Crear cotización",
  },
  {
    id: "consultar-menu",
    label: "Consultar proyectos",
  },
  {
    id: "organize-by-type",
    label: "Organizar por tipo",
  },
  {
    id: "organize-by-date-menu",
    label: "Organizar por fecha",
  },
  {
    id: "configuraciones-menu",
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
