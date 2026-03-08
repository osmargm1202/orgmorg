import React from "react"
import { Box, Text } from "ink"

export const ACCENT_COLOR = "blue"

export function ScreenFrame({
  title,
  help,
  children,
}: {
  title: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box
        borderStyle="round"
        borderColor={ACCENT_COLOR}
        flexDirection="column"
        paddingX={1}
        paddingY={0}
      >
        <Box>
          <Text bold color={ACCENT_COLOR}>
            orgmorg
          </Text>
          <Text color={ACCENT_COLOR}> · </Text>
          <Text bold>{title}</Text>
        </Box>
        {children}
      </Box>

      {help ? (
        <Box marginTop={1} paddingX={1}>
          <Text color={ACCENT_COLOR}>{help}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
