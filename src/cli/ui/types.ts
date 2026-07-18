export type ScreenType =
  | "main-menu"
  | "search-quotation"
  | "settings-menu"
  | "config-auth-method"
  | "config-token-env"
  | "config-token-web"
  | "config-api-url"
  | "config-base-path"
  | "config-api-key"

export interface MenuAction {
  id: string
  label: string
}
