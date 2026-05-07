import React from "react"
import { Box, Text } from "ink"
import { PRIMARY_COLOR } from "../theme.js"

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
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={PRIMARY_COLOR}>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
      {help ? (
        <Box marginTop={1}>
          <Text color="gray">{help}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
