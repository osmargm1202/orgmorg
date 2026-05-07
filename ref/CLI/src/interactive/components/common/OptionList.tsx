import React from 'react';
import { Box, Text } from 'ink';
import { PRIMARY_THEME_COLOR } from '../../theme.js';

export interface OptionItem {
  id: string;
  label: string;
  tone?: 'safe' | 'warning' | 'danger';
}

interface OptionListProps {
  items: OptionItem[];
  selectedIndex: number;
}

function getOptionColor(item: OptionItem, selected: boolean): 'yellowBright' | 'redBright' | 'gray' {
  if (selected) {
    return PRIMARY_THEME_COLOR;
  }

  if (item.tone === 'danger') {
    return 'redBright';
  }

  if (item.tone === 'warning') {
    return 'yellowBright';
  }

  return 'gray';
}

export function OptionList({ items, selectedIndex }: OptionListProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        return (
          <Text key={item.id} color={getOptionColor(item, selected)} bold={selected}>
            {selected ? '>' : ' '} {index + 1}. {item.label}
          </Text>
        );
      })}
    </Box>
  );
}
