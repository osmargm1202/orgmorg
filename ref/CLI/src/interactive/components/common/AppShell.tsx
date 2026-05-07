import React from 'react';
import { Box, Text } from 'ink';
import { PRIMARY_THEME_COLOR } from '../../theme.js';

interface AppShellProps {
  appVersion: string;
  children: React.ReactNode;
}

const ORGM_BANNER_LINES: readonly string[] = [
  '  ██████╗ ██████╗  ██████╗ ███╗   ███╗',
  ' ██╔═══██╗██╔══██╗██╔════╝ ████╗ ████║',
  ' ██║   ██║██████╔╝██║  ███╗██╔████╔██║',
  ' ██║   ██║██╔══██╗██║   ██║██║╚██╔╝██║',
  ' ╚██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║',
  '  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝'
] as const;

export function AppShell({ appVersion, children }: AppShellProps): React.JSX.Element {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} alignItems="flex-start">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={PRIMARY_THEME_COLOR}
        paddingX={2}
        paddingY={1}
        minWidth={96}
      >
        <Box flexDirection="column" alignItems="flex-start">
          {ORGM_BANNER_LINES.map((line, index) => (
            <Text key={line} color={PRIMARY_THEME_COLOR} bold>
              {line}
            </Text>
          ))}
          <Box>
            <Text color={PRIMARY_THEME_COLOR} bold>
              {'                      ORGM'}
            </Text>
            <Text color={PRIMARY_THEME_COLOR}>env</Text>
          </Box>
        </Box>

        <Text color="gray">Version {appVersion}</Text>

        <Box marginTop={1} flexDirection="column">
          {children}
        </Box>
      </Box>
    </Box>
  );
}
