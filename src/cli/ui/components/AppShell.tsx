import React from "react"
import { Box, Text } from "ink"
import { PRIMARY_COLOR, MUTED_COLOR } from "../theme.js"

interface AppShellProps {
  appVersion: string
  children: React.ReactNode
}

const ORGM_BANNER_LINES: readonly string[] = [
  "  ██████╗ ██████╗  ██████╗ ███╗   ███╗",
  " ██╔═══██╗██╔══██╗██╔════╝ ████╗ ████║",
  " ██║   ██║██████╔╝██║  ███╗██╔████╔██║",
  " ██║   ██║██╔══██╗██║   ██║██║╚██╔╝██║",
  " ╚██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║",
  "  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝",
] as const

export function AppShell({ appVersion, children }: AppShellProps): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} alignItems="flex-start">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PRIMARY_COLOR}
        paddingX={2}
        paddingY={1}
        minWidth={80}
      >
        <Box flexDirection="column" alignItems="flex-start">
          {ORGM_BANNER_LINES.map((line) => (
            <Text key={line} color={PRIMARY_COLOR} bold>
              {line}
            </Text>
          ))}
          <Box>
            <Text color={PRIMARY_COLOR} bold>
              {"                      ORGM"}
            </Text>
            <Text color={MUTED_COLOR}>calc</Text>
          </Box>
        </Box>

        <Text color={MUTED_COLOR}>v{appVersion}</Text>

        <Box marginTop={1} flexDirection="column">
          {children}
        </Box>
      </Box>
    </Box>
  )
}
