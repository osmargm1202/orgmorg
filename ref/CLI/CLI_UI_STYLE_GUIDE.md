# Reusable Node.js CLI UI Style Guide (Ink)

This document defines a reusable visual + interaction framework so future CLI tools can keep the same UX style as `orgmenv`.

## 1) Architecture pattern: persistent shell + content body

Use a two-layer layout:

1. **Persistent shell** (`AppShell`)
   - Always visible.
   - Contains banner, product wordmark, and version line.
   - Provides border/container and consistent spacing.
2. **Content body** (screen components)
   - Changes based on current route/menu state.
   - Mounted inside shell body area.

Reference composition:

```tsx
<AppShell appVersion={appVersion}>
  {current === 'home' ? <HomeScreen ... /> : null}
  {current === 'variables' ? <VariablesScreen ... /> : null}
  {current === 'search' ? <SearchScreen ... /> : null}
</AppShell>
```

## 2) ASCII banner approach

Keep banner lines as a constant array in the shell component and render line-by-line.

```ts
const ORGM_BANNER_LINES: readonly string[] = [
  '  ██████╗ ██████╗  ██████╗ ███╗   ███╗',
  ' ██╔═══██╗██╔══██╗██╔════╝ ████╗ ████║',
  ' ██║   ██║██████╔╝██║  ███╗██╔████╔██║',
  ' ██║   ██║██╔══██╗██║   ██║██║╚██╔╝██║',
  ' ╚██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║',
  '  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝'
] as const;
```

Wordmark pattern (big prefix + smaller lowercase suffix):

- Current: `ORGM` + `env` → `ORGMenv`
- Swap example: `ORGM` + `xyz` → `ORGMxyz`

Implementation idea:

```tsx
<Text color={PRIMARY_THEME_COLOR} bold>{'                      ORGM'}</Text>
<Text color={PRIMARY_THEME_COLOR}>xyz</Text>
```

## 3) Theme token strategy (single primary color variable)

Define one central token:

```ts
export const PRIMARY_THEME_COLOR = 'yellowBright' as const;
```

Rules:

- Use this token for **brand elements** (banner, section titles, shell border).
- Use this token for **selection/highlight elements** (selected menu item, active input cursor, focused row).
- Keep semantic functional colors separate:
  - success: `greenBright`
  - error: `redBright`
  - warning: `yellowBright`
  - neutral text: `gray`

## 4) Keyboard interaction conventions

Standard shortcuts across screens:

- `↑/↓`: move selection
- `Enter`: confirm/execute
- `1..N`: quick numeric action selection
- `b` or `Esc`: go back/cancel
- `Ctrl+C`: exit app

Screen-specific helpers can be added (for example `/` to edit search query or `a` to toggle all), but global navigation rules above should stay consistent.

## 5) Screen composition conventions

Each screen should keep this order:

1. **Title line** (primary theme color, bold)
2. **Keyboard hint line** (gray)
3. **Status line** (semantic color based on state)
4. **Action/Content sections** with gray section headers

Recommended section naming style:

- `ACTIONS`
- `RESULTS`
- `LATEST SNAPSHOT`
- `STEP X · ...`

This preserves visual rhythm and scanning speed in terminal UIs.

## 6) Dependencies model

### a) UI-only dependencies

- `ink`
- `react`
- `ink-testing-library` (for UI test rendering)

### b) Project/runtime dependencies

- `commander` (CLI command routing and flags)
- `better-sqlite3` (local data/runtime persistence)

### c) Dev dependencies

- `typescript`
- `vitest`
- `@types/node`
- `@types/react`
- `@types/better-sqlite3`

## 7) Reuse policy across future tools

When creating a new CLI tool with this style:

- **Keep visual framework unchanged** (shell, spacing, keyboard baseline, section order, theme token model).
- **Only vary business options/functions** (screen names, menu actions, domain logic).
- Maintain the same interaction grammar so users can switch tools with near-zero relearning.
