/**
 * ORGMorg theme tokens.
 *
 * Single primary color drives branding (banner, borders, selection).
 * Semantic colors are separate for functional clarity.
 */

/** Brand primary — sky-blue accent for banner, shell border, selection highlight, section titles. */
export const PRIMARY_COLOR = "blueBright" as const

/** Neutral text for menus, hints, section headers. */
export const MUTED_COLOR = "gray" as const

/** Semantic colors — never use for branding. */
export const SEMANTIC = {
  success: "greenBright",
  error: "redBright",
  warning: "yellow",
  info: "gray",
} as const

/** Selected item styling — foreground only, no background fill. */
export const SELECTED_FG = PRIMARY_COLOR
