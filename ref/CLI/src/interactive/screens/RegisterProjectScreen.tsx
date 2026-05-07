import path from 'node:path';
import process from 'node:process';
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getGitSignals } from '../../utils/git.js';
import { InputStep } from '../components/common/InputStep.js';
import { OptionList, type OptionItem } from '../components/common/OptionList.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import type { InteractiveScreenProps } from '../types.js';
import { resolveNumericSelection, updateTextInput } from '../utils/input.js';

type Mode = 'idle' | 'name' | 'alias' | 'update-alias';

interface RegistrationMatch {
  projectId: string;
  name: string;
  alias?: string;
  reasons: string[];
}

interface RegistrationState {
  matches: RegistrationMatch[];
  primaryMatch?: RegistrationMatch;
  alreadyRegistered: boolean;
  ambiguous: boolean;
}

interface RegisterProjectScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function RegisterProjectScreen({
  active,
  runtime,
  environment,
  onBack,
  onProjectStateChange
}: RegisterProjectScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState('');
  const [promptDefault, setPromptDefault] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [status, setStatus] = useState('Ready');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [autoStarted, setAutoStarted] = useState(false);

  const refreshRegistrationState = () => setRefreshNonce((prev) => prev + 1);

  const cwd = process.cwd();
  const folderName = path.basename(cwd);

  const registrationState = useMemo<RegistrationState>(() => {
    const gitSignals = getGitSignals(cwd);
    const matchMap = new Map<string, RegistrationMatch>();

    const appendMatch = (projectId: string, name: string, alias: string | undefined, reason: string): void => {
      const existing = matchMap.get(projectId);
      if (!existing) {
        matchMap.set(projectId, {
          projectId,
          name,
          alias,
          reasons: [reason]
        });
        return;
      }

      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
    };

    const rootMatch = runtime.projectRepo.findByIdentifier('root_path', cwd);
    if (rootMatch) {
      appendMatch(rootMatch.id, rootMatch.name, rootMatch.alias ?? undefined, 'root path');
    }

    if (gitSignals.gitRemote) {
      const remoteMatch = runtime.projectRepo.findByIdentifier('git_remote', gitSignals.gitRemote);
      if (remoteMatch) {
        appendMatch(remoteMatch.id, remoteMatch.name, remoteMatch.alias ?? undefined, 'git remote');
      }
    }

    if (gitSignals.repoName) {
      const repoNameMatch = runtime.projectRepo.findByIdentifier('git_repo_name', gitSignals.repoName);
      if (repoNameMatch) {
        appendMatch(repoNameMatch.id, repoNameMatch.name, repoNameMatch.alias ?? undefined, 'git repo name');
      }
    }

    const folderIdentifierMatch = runtime.projectRepo.findByIdentifier('folder_name', folderName);
    if (folderIdentifierMatch) {
      appendMatch(folderIdentifierMatch.id, folderIdentifierMatch.name, folderIdentifierMatch.alias ?? undefined, 'folder signal');
    }

    runtime.projectRepo.getByNameOrAlias(folderName).forEach((project) => {
      appendMatch(project.id, project.name, project.alias ?? undefined, 'folder alias/name');
    });

    const matches = [...matchMap.values()];
    const primaryMatch = matches[0];

    return {
      matches,
      primaryMatch,
      alreadyRegistered: matches.length > 0,
      ambiguous: matches.length > 1
    };
  }, [cwd, folderName, refreshNonce, runtime.projectRepo]);

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

  const beginRegistrationFlow = () => {
    beginPrompt('name', path.basename(cwd));
  };

  useEffect(() => {
    if (!active || autoStarted || mode !== 'idle') {
      return;
    }

    if (registrationState.alreadyRegistered) {
      if (registrationState.ambiguous) {
        setStatus(`detected ${registrationState.matches.length} registered matches in current cwd`);
      } else {
        const match = registrationState.primaryMatch;
        setStatus(`already registered: ${match?.name ?? 'unknown'} (${match?.projectId ?? '-'})`);
      }
      setAutoStarted(true);
      return;
    }

    setStatus('new project detected. complete registration.');
    beginRegistrationFlow();
    setAutoStarted(true);
  }, [active, autoStarted, mode, registrationState]);

  const submitRegistration = (name: string, alias: string): void => {
    const rootPath = cwd;
    const gitSignals = getGitSignals(rootPath);

    const created = runtime.projectRepo.create({
      name,
      alias: alias || undefined,
      rootPath,
      gitRemote: gitSignals.gitRemote,
      gitRepoName: gitSignals.repoName
    });

    runtime.projectRepo.addIdentifier(created.id, 'root_path', rootPath);
    runtime.projectRepo.addIdentifier(created.id, 'folder_name', path.basename(rootPath));

    if (gitSignals.gitRemote) {
      runtime.projectRepo.addIdentifier(created.id, 'git_remote', gitSignals.gitRemote);
    }

    if (gitSignals.repoName) {
      runtime.projectRepo.addIdentifier(created.id, 'git_repo_name', gitSignals.repoName);
    }

    if (created.alias) {
      runtime.projectRepo.addIdentifier(created.id, 'alias', created.alias);
    }

    runtime.environmentRepo.ensure(created.id, environment);
    setStatus(`project registered: ${created.name} (${created.id})`);
    refreshRegistrationState();
    onProjectStateChange();
  };

  const updateAlias = (projectId: string, alias: string): void => {
    const normalized = alias.trim();
    const updated = runtime.projectRepo.setAlias(projectId, normalized || undefined);
    setStatus(
      normalized
        ? `alias updated: ${updated.name} (${updated.alias ?? normalized})`
        : `alias cleared: ${updated.name} (${updated.id})`
    );
    refreshRegistrationState();
    onProjectStateChange();
  };

  const actions: OptionItem[] = registrationState.alreadyRegistered
    ? [
        { id: 'update-alias', label: 'Update alias', tone: 'safe' },
        { id: 're-register', label: 'Register again for this cwd', tone: 'warning' },
        { id: 'refresh', label: 'Refresh detection', tone: 'safe' },
        { id: 'back', label: 'Back', tone: 'safe' }
      ]
    : [
        { id: 'register', label: 'Register project', tone: 'safe' },
        { id: 'refresh', label: 'Refresh detection', tone: 'safe' },
        { id: 'back', label: 'Back', tone: 'safe' }
      ];

  const runAction = (actionId: string) => {
    if (actionId === 'register' || actionId === 're-register') {
      beginRegistrationFlow();
      return;
    }

    if (actionId === 'update-alias') {
      const defaultAlias = registrationState.primaryMatch?.alias ?? registrationState.primaryMatch?.name ?? folderName;
      beginPrompt('update-alias', defaultAlias);
      return;
    }

    if (actionId === 'refresh') {
      refreshRegistrationState();
      onProjectStateChange();
      setStatus('registration signals refreshed');
      return;
    }

    if (actionId === 'back') {
      onBack();
    }
  };

  useInput(
    (input, key) => {
      if (mode !== 'idle') {
        const next = updateTextInput(draft, input, key);
        if (next.canceled) {
          resetPrompt();
          setNameDraft('');
          return;
        }

        if (!next.submitted) {
          setDraft(next.value);
          return;
        }

        try {
          if (mode === 'name') {
            const fallbackName = path.basename(cwd);
            const resolvedName = next.value.trim() || fallbackName;
            setNameDraft(resolvedName);
            beginPrompt('alias', resolvedName);
            return;
          }

          if (mode === 'update-alias') {
            const match = registrationState.primaryMatch;
            if (!match) {
              throw new Error('No project match found for alias update. Refresh and retry.');
            }

            updateAlias(match.projectId, next.value);
            resetPrompt();
            setNameDraft('');
            return;
          }

          submitRegistration(nameDraft, next.value.trim());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus(`error: ${message}`);
        }

        resetPrompt();
        setNameDraft('');
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

  if (mode !== 'idle') {
    const label =
      mode === 'name'
        ? 'Project name:'
        : mode === 'alias'
          ? 'Alias (optional):'
          : 'Alias (empty clears alias):';

    return (
      <InputStep
        title="Register project"
        label={label}
        value={draft}
        defaultValue={promptDefault}
        hint={
          mode === 'name'
            ? 'Confirm project name to continue.'
            : mode === 'alias'
              ? 'Alias can be empty.'
              : 'Update alias for current registered project.'
        }
        status={status}
      />
    );
  }

  const statusColor: 'greenBright' | 'redBright' = status.startsWith('error:') ? 'redBright' : 'greenBright';

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Register project
      </Text>
      <Text color="gray">{`↑/↓ move · Enter confirm · 1-${actions.length} quick select · b/esc back`}</Text>
      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">REGISTRATION DETECTION</Text>
        {registrationState.matches.length === 0 ? <Text color="gray">- no existing registration signals found</Text> : null}
        {registrationState.matches.slice(0, 4).map((match) => (
          <Text key={match.projectId}>
            - {match.name} ({match.projectId}){match.alias ? ` · alias=${match.alias}` : ''} · via {match.reasons.join(', ')}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">ACTIONS</Text>
        <OptionList items={actions} selectedIndex={selectedIndex} />
      </Box>
    </Box>
  );
}
