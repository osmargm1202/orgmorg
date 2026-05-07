import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ScreenId } from '../types.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';

interface Action {
  key: string;
  label: string;
  screen?: ScreenId;
  exit?: boolean;
  tone?: 'safe' | 'danger';
}

const ACTIONS: Action[] = [
  { key: '1', label: 'Generate env', screen: 'generate-env', tone: 'safe' },
  { key: '2', label: 'Current project', screen: 'current-project', tone: 'safe' },
  { key: '3', label: 'Variables', screen: 'variables', tone: 'safe' },
  { key: '4', label: 'Search', screen: 'search', tone: 'safe' },
  { key: '5', label: 'History / Restore', screen: 'history-restore', tone: 'safe' },
  { key: '6', label: 'Register project', screen: 'register-project', tone: 'safe' },
  { key: '7', label: 'Configuration menu', screen: 'local-config', tone: 'safe' },
  { key: '8', label: 'Exit', exit: true, tone: 'danger' }
];

interface HomeScreenProps {
  active: boolean;
  onNavigate: (screen: ScreenId) => void;
  onExit: () => void;
}

export function HomeScreen({ active, onNavigate, onExit }: HomeScreenProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedAction = useMemo(
    () => ACTIONS[selectedIndex],
    [selectedIndex]
  );
  const totalItems = ACTIONS.length;

  const getActionColor = (action: Action, selected: boolean): 'yellowBright' | 'redBright' | 'gray' => {
    if (selected) {
      return PRIMARY_THEME_COLOR;
    }

    return action.tone === 'danger' ? 'redBright' : 'gray';
  };

  useInput(
    (input, key) => {
      const numeric = ACTIONS.find((action) => action.key === input);
      if (numeric) {
        if (numeric.exit) {
          onExit();
          return;
        }

        if (numeric.screen) {
          onNavigate(numeric.screen);
        }
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        return;
      }

      if (key.return) {
        if (selectedAction?.exit) {
          onExit();
          return;
        }

        if (selectedAction?.screen) {
          onNavigate(selectedAction.screen);
        }
      }
    },
    { isActive: active }
  );

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray">MAIN MENU</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {ACTIONS.map((action, index) => {
          const selected = index === selectedIndex;
          return (
            <Text key={action.key} color={getActionColor(action, selected)} bold={selected}>
              {selected ? '>' : ' '} {action.key}. {action.label}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">↑/↓ move · Enter confirm · 1-8 quick select</Text>
      </Box>
    </Box>
  );
}
