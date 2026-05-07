import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EnvVersion } from '../../types/domain.js';
import { InputStep } from '../components/common/InputStep.js';
import { OptionList, type OptionItem } from '../components/common/OptionList.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import type { InteractiveScreenProps } from '../types.js';
import { resolveNumericSelection, updateTextInput } from '../utils/input.js';

interface HistoryRestoreScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function HistoryRestoreScreen({
  active,
  runtime,
  environment,
  projectState,
  onBack,
  onProjectStateChange
}: HistoryRestoreScreenProps): React.JSX.Element {
  const [status, setStatus] = useState('Ready');
  const [prompting, setPrompting] = useState(false);
  const [draft, setDraft] = useState('');
  const [promptDefault, setPromptDefault] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const projectId = projectState.project?.id;

  const history = useMemo<EnvVersion[]>(() => {
    if (!projectId) {
      return [];
    }

    const env = runtime.environmentRepo.getByName(projectId, environment);
    if (!env) {
      return [];
    }

    return runtime.versionRepo.history(projectId, env.id);
  }, [projectId, environment, runtime, refreshNonce]);

  const refresh = () => setRefreshNonce((prev) => prev + 1);

  const actions: OptionItem[] = [
    { id: 'refresh', label: 'Refresh history', tone: 'safe' },
    { id: 'restore', label: 'Restore version', tone: 'warning' },
    { id: 'back', label: 'Back', tone: 'safe' }
  ];

  const runAction = (actionId: string) => {
    if (actionId === 'refresh') {
      refresh();
      setStatus('history refreshed');
      return;
    }

    if (actionId === 'restore') {
      const suggestedVersion = history[0]?.versionNumber?.toString() ?? '';
      setPrompting(true);
      setPromptDefault(suggestedVersion);
      setDraft(suggestedVersion);
      return;
    }

    if (actionId === 'back') {
      onBack();
    }
  };

  useInput(
    (input, key) => {
      if (prompting) {
        const next = updateTextInput(draft, input, key);
        if (next.canceled) {
          setPrompting(false);
          setPromptDefault('');
          setDraft('');
          return;
        }

        if (!next.submitted) {
          setDraft(next.value);
          return;
        }

        try {
          if (!projectId) {
            throw new Error('No resolved project. Register/select a project first.');
          }

          const versionNumber = Number.parseInt(next.value.trim(), 10);
          if (!Number.isInteger(versionNumber) || versionNumber < 1) {
            throw new Error('version must be a positive integer');
          }

          const created = runtime.versioning.restoreSnapshot({
            projectId,
            environment,
            versionNumber,
            sourceNote: `interactive restore from ${versionNumber}`
          });

          setStatus(`restored version ${versionNumber}. new version=${created.versionNumber}`);
          refresh();
          onProjectStateChange();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus(`error: ${message}`);
        }

        setPrompting(false);
        setPromptDefault('');
        setDraft('');
        return;
      }

      if (key.escape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % actions.length);
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => (prev - 1 + actions.length) % actions.length);
        return;
      }

      const numericSelection = resolveNumericSelection(input, actions.length);
      if (numericSelection !== undefined) {
        runAction(actions[numericSelection].id);
        return;
      }

      if (key.return) {
        runAction(actions[selectedIndex].id);
      }
    },
    { isActive: active }
  );

  if (prompting) {
    return (
      <InputStep
        title="Restore input"
        label="Version number to restore:"
        value={draft}
        defaultValue={promptDefault}
        hint="Use a positive integer version."
        status={status}
      />
    );
  }

  const statusColor: 'greenBright' | 'redBright' = status.startsWith('error:') ? 'redBright' : 'greenBright';

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        History & Restore
      </Text>
      <Text color="gray">↑/↓ move · Enter confirm · 1-3 quick select · b/esc back</Text>
      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">ACTIONS</Text>
        <OptionList items={actions} selectedIndex={selectedIndex} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">LATEST HISTORY</Text>
        {history.length === 0 ? <Text color="gray">(empty)</Text> : null}
        {history.slice(0, 12).map((entry) => (
          <Text key={entry.id}>
            - v{entry.versionNumber} · {entry.sourceType} · {entry.createdAt}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
