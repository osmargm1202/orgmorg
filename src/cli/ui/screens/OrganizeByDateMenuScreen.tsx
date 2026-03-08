import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "organize-by-date-year",
    label: "Año",
    hint: "Agrupa las entradas del directorio actual por año",
  },
  {
    id: "organize-by-date-month",
    label: "Mes",
    hint: "Agrupa las entradas del directorio actual por año y mes",
  },
  {
    id: "organize-by-date-day",
    label: "Día",
    hint: "Agrupa las entradas del directorio actual por año, mes y día",
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
