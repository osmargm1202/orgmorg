import React from "react"
import { MenuScreen } from "../components/MenuScreen.js"

const OPCIONES = [
  {
    id: "crear-cotizacion",
    label: "Crear cotización",
    hint: "Proyecto nuevo o cotización para un proyecto existente",
  },
  {
    id: "consultar-menu",
    label: "Consultar proyectos",
    hint: "Buscar proyectos, ver el último número y recrear carpetas",
  },
  {
    id: "db-seed",
    label: "Poblar base de datos",
    hint: "Importar proyectos y cotizaciones desde el JSON local",
  },
  {
    id: "configuraciones-menu",
    label: "Configuración",
    hint: "Sesión OAuth, URLs de Neon y directorio base",
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
