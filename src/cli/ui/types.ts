export type ScreenType =
  | "main-menu"
  | "search-quotation"
  | "settings-menu"
  | "config-token-login"
  | "config-api-url"
  | "config-base-path"
  | "config-api-key"

export interface MenuAction {
  id: string
  label: string
}
