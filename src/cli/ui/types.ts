export type ScreenType =
  | "main-menu"
  | "crear-cotizacion"
  | "consultar-menu"
  | "configuraciones-menu"
  | "organize-by-type"
  | "organize-by-date-menu"
  | "organize-by-date-year"
  | "organize-by-date-month"
  | "organize-by-date-day"
  | "listar-proyectos"
  | "editar-proyecto"
  | "ultimo-numero"
  | "recrear-carpeta"
  | "config-db-path"
  | "config-path"

export interface MenuAction {
  id: string
  label: string
}
