import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { parseEnvInput } from '../../commands/import.js';
import type { EnvVariable } from '../../types/domain.js';
import { InputStep } from '../components/common/InputStep.js';
import { OptionList, type OptionItem } from '../components/common/OptionList.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import type { InteractiveScreenProps } from '../types.js';
import { resolveNumericSelection, updateTextInput } from '../utils/input.js';
import { SUPPORTED_ARTIFACT_FILE_TYPES } from '../../services/importedArtifactService.js';

type Mode =
  | 'idle'
  | 'set-key'
  | 'set-value'
  | 'unset-key'
  | 'import-merge-path'
  | 'import-replace-path'
  | 'global-alias'
  | 'global-key'
  | 'global-value';

function previewValue(value: string): string {
  if (value.length <= 4) {
    return '****';
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

interface VariablesScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function VariablesScreen({
  active,
  runtime,
  environment,
  projectState,
  onBack,
  onProjectStateChange
}: VariablesScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState('');
  const [promptDefault, setPromptDefault] = useState('');
  const [pendingKey, setPendingKey] = useState('');
  const [pendingAlias, setPendingAlias] = useState('');
  const [status, setStatus] = useState('Ready');
  const [nonce, setNonce] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const projectId = projectState.project?.id;

  const variables = useMemo<EnvVariable[]>(() => {
    if (!projectId) {
      return [];
    }

    const env = runtime.environmentRepo.getByName(projectId, environment);
    if (!env) {
      return [];
    }

    return runtime.variableRepo.getLatestSnapshot(projectId, env.id);
  }, [projectId, environment, runtime, nonce]);

  const refresh = () => setNonce((prev) => prev + 1);

  const actions: OptionItem[] = [
    { id: 'set', label: 'Set variable', tone: 'safe' },
    { id: 'unset', label: 'Unset variable', tone: 'warning' },
    { id: 'import-merge', label: 'Import merge from file', tone: 'safe' },
    { id: 'import-replace', label: 'Import replace from file', tone: 'warning' },
    { id: 'upsert-global', label: 'Upsert global variable', tone: 'safe' },
    { id: 'refresh', label: 'Refresh', tone: 'safe' },
    { id: 'back', label: 'Back', tone: 'safe' }
  ];

  const runAction = (actionId: string) => {
    if (actionId === 'set') {
      beginPrompt('set-key', 'NEW_KEY');
      return;
    }

    if (actionId === 'unset') {
      beginPrompt('unset-key', variables[0]?.key ?? '');
      return;
    }

    if (actionId === 'import-merge') {
      beginPrompt('import-merge-path', '.env');
      return;
    }

    if (actionId === 'import-replace') {
      beginPrompt('import-replace-path', '.env');
      return;
    }

    if (actionId === 'upsert-global') {
      beginPrompt('global-alias', projectState.project?.alias ?? projectState.project?.name ?? 'shared');
      return;
    }

    if (actionId === 'refresh') {
      refresh();
      onProjectStateChange();
      setStatus('reloaded');
      return;
    }

    if (actionId === 'back') {
      onBack();
    }
  };

  const beginPrompt = (nextMode: Mode, defaultValue: string) => {
    setMode(nextMode);
    setPromptDefault(defaultValue);
    setDraft(defaultValue);
  };

  const resetPrompt = () => {
    setMode('idle');
    setPromptDefault('');
    setDraft('');
  };

  useInput(
    (input, key) => {
      if (mode !== 'idle') {
        const next = updateTextInput(draft, input, key);
        if (next.canceled) {
          resetPrompt();
          return;
        }

        if (!next.submitted) {
          setDraft(next.value);
          return;
        }

        try {
          if (!projectId && mode !== 'global-alias' && mode !== 'global-key' && mode !== 'global-value') {
            throw new Error('No resolved project. Register/select a project first.');
          }

          switch (mode) {
            case 'set-key': {
              setPendingKey(next.value.trim());
              beginPrompt('set-value', '');
              return;
            }

            case 'set-value': {
              const result = runtime.variableService.mutate({
                projectId: projectId!,
                environment,
                operation: 'set',
                key: pendingKey,
                value: next.value,
                sourceType: 'interactive'
              });
              setStatus(`saved ${pendingKey}. version=${result.version.versionNumber}`);
              refresh();
              break;
            }

            case 'unset-key': {
              const keyValue = next.value.trim();
              const result = runtime.variableService.mutate({
                projectId: projectId!,
                environment,
                operation: 'unset',
                key: keyValue,
                sourceType: 'interactive'
              });
              setStatus(`removed ${keyValue}. version=${result.version.versionNumber}`);
              refresh();
              break;
            }

            case 'import-merge-path':
            case 'import-replace-path': {
              const filePath = next.value.trim();
              if (!filePath) {
                throw new Error('file path is required');
              }

              const imported = runtime.importedArtifactService.importFromFile({
                projectId: projectId!,
                environment,
                filePath
              });

              const mergeMode = mode === 'import-replace-path' ? 'replace' : 'merge';

              if (imported.artifact.fileType === '.env') {
                const entries = parseEnvInput(imported.rawContent);
                const result = runtime.variableService.mutate({
                  projectId: projectId!,
                  environment,
                  operation: 'import',
                  mergeMode,
                  importEntries: entries,
                  sourceType: 'interactive'
                });
                setStatus(
                  `imported ${entries.length} env entries (${mergeMode}) + stored artifact ${imported.artifact.fileName}. version=${result.version.versionNumber}`
                );
                refresh();
                break;
              }

              setStatus(
                `stored artifact ${imported.artifact.fileName} (${imported.artifact.fileType}) for ${environment}. merge/replace applies only to .env content.`
              );
              break;
            }

            case 'global-alias': {
              setPendingAlias(next.value.trim());
              beginPrompt('global-key', 'GLOBAL_KEY');
              return;
            }

            case 'global-key': {
              setPendingKey(next.value.trim());
              beginPrompt('global-value', '');
              return;
            }

            case 'global-value': {
              const stored = runtime.globalVariableService.upsert({
                alias: pendingAlias,
                key: pendingKey,
                value: next.value,
                encrypted: true,
                isSecret: true
              });
              setStatus(`upserted global ${stored.key} (${stored.alias})`);
              break;
            }

            default:
              break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus(`error: ${message}`);
        }

        resetPrompt();
        onProjectStateChange();
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

  const prompt = (() => {
    switch (mode) {
      case 'set-key':
        return 'Set variable · key:';
      case 'set-value':
        return `Set variable · value for ${pendingKey}:`;
      case 'unset-key':
        return 'Unset variable · key:';
      case 'import-merge-path':
        return `Import merge · file path (${SUPPORTED_ARTIFACT_FILE_TYPES.join(', ')}):`;
      case 'import-replace-path':
        return `Import replace · file path (${SUPPORTED_ARTIFACT_FILE_TYPES.join(', ')}):`;
      case 'global-alias':
        return 'Global variable · alias:';
      case 'global-key':
        return 'Global variable · key:';
      case 'global-value':
        return 'Global variable · value:';
      default:
        return '';
    }
  })();

  if (mode !== 'idle') {
    return (
      <InputStep
        title="Variables input"
        label={prompt}
        value={draft}
        defaultValue={promptDefault}
        hint={
          mode === 'import-merge-path' || mode === 'import-replace-path'
            ? `Supported types: ${SUPPORTED_ARTIFACT_FILE_TYPES.join(', ')}`
            : undefined
        }
        status={status}
      />
    );
  }

  const statusColor: 'greenBright' | 'redBright' = status.startsWith('error:') ? 'redBright' : 'greenBright';

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Variables
      </Text>
      <Text color="gray">↑/↓ move · Enter confirm · 1-7 quick select · b/esc back</Text>
      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">ACTIONS</Text>
        <OptionList items={actions} selectedIndex={selectedIndex} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">LATEST SNAPSHOT ({variables.length})</Text>
        {variables.length === 0 ? <Text color="gray">(empty)</Text> : null}
        {variables.slice(0, 12).map((entry) => (
          <Text key={entry.id}>
            - {entry.key}={previewValue(runtime.encryption.decryptForUse(entry.value))}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
