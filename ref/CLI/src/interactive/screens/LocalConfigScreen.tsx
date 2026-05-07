import path from 'node:path';
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { generateAgeKeyFile } from '../../services/keygen.js';
import { resolveEffectiveKeyState } from '../../services/keyManagement.js';
import { resolveOrgmenvPaths } from '../../utils/paths.js';
import { InputStep } from '../components/common/InputStep.js';
import { OptionList, type OptionItem } from '../components/common/OptionList.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import type { InteractiveScreenProps } from '../types.js';
import { resolveNumericSelection, updateTextInput } from '../utils/input.js';

interface LocalConfigScreenProps extends InteractiveScreenProps {
  active: boolean;
}

type PromptMode = 'none' | 'set-key-path' | 'generate-key-file';

type MenuAction =
  | 'toggle-encryption'
  | 'init-db'
  | 'set-key-path'
  | 'clear-key-path'
  | 'generate-key-file'
  | 'refresh-diagnostics'
  | 'back';

interface MenuItem extends OptionItem {
  action: MenuAction;
}

export function LocalConfigScreen({ active, runtime, onBack }: LocalConfigScreenProps): React.JSX.Element {
  const [status, setStatus] = useState('Ready');
  const [promptMode, setPromptMode] = useState<PromptMode>('none');
  const [promptDefault, setPromptDefault] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const ageKeyEnv = process.env.AGE_KEY_FILE?.trim() || '';
  const effectiveKeyState = resolveEffectiveKeyState(runtime.config.keyPath);
  const shouldShowKeyManagement = effectiveKeyState.status !== 'configured';

  const menuItems = useMemo<MenuItem[]>(
    () => {
      const baseItems: MenuItem[] = [
        {
          id: 'toggle-encryption',
          action: 'toggle-encryption',
          label: `Toggle encryption (currently ${runtime.config.useEncryption ? 'enabled' : 'disabled'})`,
          tone: 'warning'
        }
      ];

      if (!runtime.dbState.exists) {
        baseItems.push({
          id: 'init-db',
          action: 'init-db',
          label: 'Init DB (create file + run migrations)',
          tone: 'safe'
        });
      }

      if (shouldShowKeyManagement) {
        baseItems.push(
          {
            id: 'set-key-path',
            action: 'set-key-path',
            label: `Set fallback key path (current: ${runtime.config.keyPath?.trim() || 'not set'})`,
            tone: 'safe'
          },
          {
            id: 'clear-key-path',
            action: 'clear-key-path',
            label: 'Clear fallback key path',
            tone: 'danger'
          },
          {
            id: 'generate-key-file',
            action: 'generate-key-file',
            label: 'Generate age key file',
            tone: 'safe'
          }
        );
      }

      baseItems.push(
        {
          id: 'refresh-diagnostics',
          action: 'refresh-diagnostics',
          label: 'Refresh diagnostics',
          tone: 'safe'
        },
        {
          id: 'back',
          action: 'back',
          label: 'Back',
          tone: 'safe'
        }
      );

      return baseItems;
    },
    [runtime.config.keyPath, runtime.config.useEncryption, runtime.dbState.exists, shouldShowKeyManagement]
  );

  const keySource = runtime.encryption.resolveKeySource();
  const diagnostics = runtime.diagnostics.run();

  const defaultGeneratedKeyPath = effectiveKeyState.generationTargetPath || path.join(resolveOrgmenvPaths().configDir, 'keys', 'age.txt');

  useEffect(() => {
    setSelectedIndex((prev) => (menuItems.length === 0 ? 0 : Math.min(prev, menuItems.length - 1)));
  }, [menuItems.length]);

  const beginPrompt = (mode: PromptMode, defaultValue: string) => {
    setPromptMode(mode);
    setPromptDefault(defaultValue);
    setDraft(defaultValue);
  };

  const resetPrompt = () => {
    setPromptMode('none');
    setPromptDefault('');
    setDraft('');
  };

  const executeAction = (action: MenuAction) => {
    switch (action) {
      case 'toggle-encryption':
        runtime.config.useEncryption = !runtime.config.useEncryption;
        setStatus(`encryption ${runtime.config.useEncryption ? 'enabled' : 'disabled'}`);
        return;

      case 'set-key-path':
        beginPrompt('set-key-path', runtime.config.keyPath ?? '');
        return;

      case 'init-db': {
        const before = runtime.dbState;
        const nextState = runtime.initDb();

        if (!before.exists && nextState.exists && nextState.initialized) {
          setStatus(`database initialized at ${nextState.path}`);
        } else if (nextState.initialized) {
          setStatus(`database already initialized at ${nextState.path}`);
        } else {
          setStatus(`warning: database still not initialized at ${nextState.path}`);
        }
        return;
      }

      case 'clear-key-path':
        runtime.config.keyPath = undefined;
        setStatus('fallback key path cleared');
        return;

      case 'generate-key-file':
        beginPrompt('generate-key-file', defaultGeneratedKeyPath);
        return;

      case 'refresh-diagnostics':
        runtime.refreshDbState();
        setStatus('diagnostics refreshed');
        return;

      case 'back':
        onBack();
        return;

      default:
        return;
    }
  };

  useInput(
    (input, key) => {
      if (promptMode !== 'none') {
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
          if (promptMode === 'set-key-path') {
            const value = next.value.trim();
            runtime.config.keyPath = value || undefined;
            setStatus(value ? `fallback key path set: ${value}` : 'fallback key path cleared');
          }

          if (promptMode === 'generate-key-file') {
            const generationResult = generateAgeKeyFile(next.value.trim() || defaultGeneratedKeyPath);
            const ageKeyEnvPath = process.env.AGE_KEY_FILE?.trim();

            if (!ageKeyEnvPath) {
              runtime.config.keyPath = generationResult.path;
            }

            if (generationResult.reused) {
              setStatus(`existing key reused at ${generationResult.path} (no new key created)`);
            } else {
              setStatus(`key generated at ${generationResult.path}`);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus(`error: ${message}`);
        }

        resetPrompt();
        return;
      }

      if (key.escape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % menuItems.length);
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        return;
      }

      const numericSelection = resolveNumericSelection(input, menuItems.length);
      if (numericSelection !== undefined) {
        executeAction(menuItems[numericSelection].action);
        return;
      }

      if (key.return) {
        executeAction(menuItems[selectedIndex].action);
      }
    },
    { isActive: active }
  );

  const promptLabel =
    promptMode === 'set-key-path'
      ? 'Fallback key path (empty clears value):'
      : promptMode === 'generate-key-file'
        ? 'Output key file path (empty uses default):'
        : '';

  const statusColor: 'greenBright' | 'redBright' | 'yellowBright' = status.startsWith('error:')
    ? 'redBright'
    : status.includes('warning')
      ? 'yellowBright'
      : 'greenBright';

  if (promptMode !== 'none') {
    return (
      <InputStep
        title="Configuration input"
        label={promptLabel}
        value={draft}
        defaultValue={promptDefault}
        hint="Confirm to apply configuration change."
        status={status}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Configuration menu
      </Text>
      <Text color="gray">{`↑/↓ move · Enter confirm · 1-${menuItems.length} quick select · b/esc back`}</Text>

      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">CURRENT CONFIGURATION</Text>
        <Text>db path: {runtime.config.dbPath}</Text>
        <Text>db exists: {runtime.dbState.exists ? 'yes' : 'no'}</Text>
        <Text>db initialized: {runtime.dbState.initialized ? 'yes' : 'no'}</Text>
        <Text>db connection: {runtime.dbState.usingFallbackConnection ? 'fallback (:memory:)' : 'configured path'}</Text>
        <Text>encryption: {runtime.config.useEncryption ? 'enabled' : 'disabled (plaintext warning)'}</Text>
        <Text>AGE_KEY_FILE env: {ageKeyEnv ? `defined (${ageKeyEnv})` : 'not defined'}</Text>
        <Text>fallback key path: {runtime.config.keyPath?.trim() || 'not set'}</Text>
        <Text>effective key source: {keySource.source === 'none' ? 'none' : `${keySource.source} (${keySource.path})`}</Text>
        <Text>effective key state: {effectiveKeyState.status}</Text>
        <Text>effective key file: {effectiveKeyState.existingKeyPath || 'missing'}</Text>
      </Box>

      {promptMode !== 'none' ? (
        <Text color="yellow">
          {promptLabel} {draft}
        </Text>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">CONFIG ACTIONS</Text>
        <OptionList items={menuItems} selectedIndex={selectedIndex} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">TOOLING DIAGNOSTICS</Text>
        {diagnostics.tools.map((tool) => (
          <Text key={tool.name}>
            - {tool.name}: {tool.available ? 'ok' : 'missing'}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
