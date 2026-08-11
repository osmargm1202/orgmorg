import React, { useEffect, useState } from "react"
import { Box, Text, useStdout } from "ink"
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

const OUTER_HORIZONTAL_PADDING = 1
const PANEL_HORIZONTAL_PADDING = 2
const PANEL_BORDER_WIDTH = 1
const FULL_BANNER_WIDTH = Math.max(...ORGM_BANNER_LINES.map((line) => line.length))
const FULL_BANNER_REQUIRED_COLUMNS =
  FULL_BANNER_WIDTH +
  2 * (OUTER_HORIZONTAL_PADDING + PANEL_HORIZONTAL_PADDING + PANEL_BORDER_WIDTH)

function useTerminalColumns(): number {
  const { stdout } = useStdout()
  const [columns, setColumns] = useState(stdout.columns || 80)

  useEffect(() => {
    const updateColumns = () => setColumns(stdout.columns || 80)
    stdout.on("resize", updateColumns)
    return () => {
      stdout.off("resize", updateColumns)
    }
  }, [stdout])

  return columns
}

export function AppShell({ appVersion, children }: AppShellProps): React.JSX.Element {
  const columns = useTerminalColumns()
  const fullBannerVisible = columns >= FULL_BANNER_REQUIRED_COLUMNS

  return (
    <Box
      flexDirection="column"
      paddingX={OUTER_HORIZONTAL_PADDING}
      paddingY={1}
      width={columns}
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PRIMARY_COLOR}
        paddingX={PANEL_HORIZONTAL_PADDING}
        paddingY={1}
        flexGrow={1}
      >
        <Box flexDirection="column" alignItems="flex-start">
          {fullBannerVisible ? (
            <>
              {ORGM_BANNER_LINES.map((line) => (
                <Text key={line} color={PRIMARY_COLOR} bold>
                  {line}
                </Text>
              ))}
              <Box>
                <Text color={PRIMARY_COLOR} bold>
                  {"                      ORGM"}
                </Text>
                <Text color={MUTED_COLOR}>org</Text>
              </Box>
            </>
          ) : (
            <Text color={PRIMARY_COLOR} bold>
              ORGM<Text color={MUTED_COLOR}>org</Text>
            </Text>
          )}
        </Box>

        <Text color={MUTED_COLOR}>v{appVersion}</Text>

        <Box marginTop={1} flexDirection="column">
          {children}
        </Box>
      </Box>
    </Box>
  )
}
