import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "organize-by-date-year",
    label: "Año",
  },
  {
    id: "organize-by-date-month",
    label: "Mes",
  },
  {
    id: "organize-by-date-day",
    label: "Día",
  },
]

export function OrganizeByDateMenuScreen({
  onSelect,
  onBack,
}: {
  onSelect: (id: string) => void
  onBack: () => void
}) {
  return (
    <MenuScreen
      title="Organizar por fecha"
      help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      items={OPCIONES}
      onSelect={onSelect}
      onBack={onBack}
    />
  )
}
