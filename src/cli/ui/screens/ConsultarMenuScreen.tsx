import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "listar-proyectos",
    label: "Consultar proyectos",
    hint: "Buscar por nombre o listar los primeros proyectos cargados",
  },
  {
    id: "ultimo-numero",
    label: "Ver último número",
  },
  {
    id: "recrear-carpeta",
    label: "Recrear carpeta",
    hint: "Crear la carpeta de una cotización ya registrada",
  },
]

export function ConsultarMenuScreen({
  onSelect,
  onBack,
}: {
  onSelect: (id: string) => void
  onBack: () => void
}) {
  return (
    <MenuScreen
      title="Consultar proyectos"
      help="↑/↓ mover · Enter elegir · Esc volver · Ctrl+C salir"
      items={OPCIONES}
      onSelect={onSelect}
      onBack={onBack}
    />
  )
}
