import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ScopeTaggedVariable } from '../../types/domain.js';
import { InputStep } from '../components/common/InputStep.js';
import type { InteractiveScreenProps } from '../types.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import { updateTextInput } from '../utils/input.js';

interface SearchScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function SearchScreen({ active, runtime, onBack }: SearchScreenProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(true);
  const [promptDefault, setPromptDefault] = useState('');
  const [status, setStatus] = useState('Type query and press Enter.');
  const [results, setResults] = useState<ScopeTaggedVariable[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [detailMode, setDetailMode] = useState(false);

  const selectedResult = useMemo(
    () => (results.length > 0 ? results[selectedResultIndex] : undefined),
    [results, selectedResultIndex]
  );

  const runSearch = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setStatus('Query is required.');
      setResults([]);
      return;
    }

    const response = runtime.globalVariableService.search(normalized);
    setResults(response.values);
    setSelectedResultIndex(0);
    setDetailMode(false);
    setStatus(`found ${response.values.length} result(s)`);
  };

  useInput(
    (input, key) => {
      if (editing) {
        const next = updateTextInput(query, input, key);
        if (next.canceled) {
          setEditing(false);
          setPromptDefault('');
          return;
        }

        if (!next.submitted) {
          setQuery(next.value);
          return;
        }

        runSearch(next.value);
        setEditing(false);
        setPromptDefault('');
        return;
      }

      if (detailMode) {
        if (key.escape || input.toLowerCase() === 'b') {
          setDetailMode(false);
          return;
        }

        if (key.downArrow) {
          setSelectedResultIndex((prev) => (prev + 1) % Math.max(results.length, 1));
          return;
        }

        if (key.upArrow) {
          setSelectedResultIndex((prev) => (prev - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1));
        }

        return;
      }

      if (key.escape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      if (input === '/') {
        setEditing(true);
        setPromptDefault(query);
        setQuery(query);
        return;
      }

      if (input.toLowerCase() === 'r') {
        runSearch(query);
        return;
      }

      if (results.length > 0 && key.downArrow) {
        setSelectedResultIndex((prev) => (prev + 1) % results.length);
        return;
      }

      if (results.length > 0 && key.upArrow) {
        setSelectedResultIndex((prev) => (prev - 1 + results.length) % results.length);
        return;
      }

      if (results.length > 0 && key.return) {
        setDetailMode(true);
      }
    },
    { isActive: active }
  );

  if (editing) {
    return (
      <InputStep
        title="Search input"
        label="Query:"
        value={query}
        defaultValue={promptDefault}
        hint="Type text and press Enter to run search."
        status={status}
      />
    );
  }

  const statusColor: 'greenBright' | 'redBright' | 'yellowBright' | 'gray' = status.startsWith('found')
    ? 'greenBright'
    : status.toLowerCase().includes('required')
      ? 'yellowBright'
      : 'gray';

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Search
      </Text>
      <Text color="gray">
        {detailMode
          ? 'Detail view · ↑/↓ next result · b/esc back to results'
          : '↑/↓ move result · Enter detail · / edit query · r rerun · b/esc back'}
      </Text>
      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>
      <Text color="gray">query: {query || '(none)'}</Text>

      {!detailMode ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">RESULTS ({results.length})</Text>
          {results.length === 0 ? <Text color="gray">(empty)</Text> : null}
          {results.slice(0, 20).map((entry, index) => {
            const selected = index === selectedResultIndex;
            return (
              <Text key={`${entry.scope}-${entry.key}-${index}`} color={selected ? PRIMARY_THEME_COLOR : undefined} bold={selected}>
                {selected ? '>' : ' '} [{entry.scope}] {entry.key} · alias={entry.alias ?? '-'} · env={entry.environment ?? '-'} · preview={entry.valuePreview}
              </Text>
            );
          })}
        </Box>
      ) : null}

      {detailMode && selectedResult ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">DETAIL</Text>
          <Text>
            scope: [{selectedResult.scope}] · alias={selectedResult.alias ?? '-'} · env={selectedResult.environment ?? '-'}
          </Text>
          <Text>
            key: <Text color={PRIMARY_THEME_COLOR}>{selectedResult.key}</Text>
          </Text>
          <Text>
            value: <Text color="greenBright">{selectedResult.value}</Text>
          </Text>
          <Text color="gray">Tip: seleccioná este texto para copiar el valor.</Text>
        </Box>
      ) : null}
    </Box>
  );
}
