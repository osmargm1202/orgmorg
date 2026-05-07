import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "listar-proyectos",
    label: "Consultar proyectos",
  },
  {
    id: "editar-proyecto",
    label: "Editar nombre de proyecto",
  },
  {
    id: "ultimo-numero",
    label: "Ver último número",
  },
  {
    id: "recrear-carpeta",
    label: "Recrear carpeta",
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
