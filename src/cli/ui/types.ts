export type ScreenType =
  | "main-menu"
  | "crear-cotizacion"
  | "consultar-menu"
  | "configuraciones-menu"
  | "db-seed"
  | "listar-proyectos"
  | "ultimo-numero"
  | "recrear-carpeta"
  | "config-auth-url"
  | "config-api-url"
  | "config-path"
  | "auth-login"
  | "auth-status"
  | "auth-logout"

export interface MenuAction {
  id: string
  label: string
}
