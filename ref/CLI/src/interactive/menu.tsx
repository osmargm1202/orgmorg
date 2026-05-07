import process from 'node:process';
import React, { useMemo, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type { GlobalCliOptions, RuntimeServices } from '../commands/runtime.js';
import { getGitSignals } from '../utils/git.js';
import { AppShell } from './components/common/AppShell.js';
import { CurrentProjectScreen } from './screens/CurrentProjectScreen.js';
import { GenerateEnvScreen } from './screens/GenerateEnvScreen.js';
import { HistoryRestoreScreen } from './screens/HistoryRestoreScreen.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { LocalConfigScreen } from './screens/LocalConfigScreen.js';
import { RegisterProjectScreen } from './screens/RegisterProjectScreen.js';
import { SearchScreen } from './screens/SearchScreen.js';
import { VariablesScreen } from './screens/VariablesScreen.js';
import type { ProjectResolutionState, ScreenId } from './types.js';

interface InteractiveMenuProps {
  runtime: RuntimeServices;
  options: GlobalCliOptions;
  appVersion: string;
}

function resolveProjectState(runtime: RuntimeServices, options: GlobalCliOptions): ProjectResolutionState {
  if (!runtime.dbState.initialized) {
    return {
      note: 'database not initialized. Open Configuration menu (option 7) and run Init DB.'
    };
  }

  const cwd = process.cwd();
  const explicit = options.project?.trim();

  if (explicit) {
    const byId = runtime.projectRepo.getById(explicit);
    if (byId) {
      return { project: byId, note: 'resolved by explicit --project id' };
    }

    const byNameOrAlias = runtime.projectRepo.getByNameOrAlias(explicit);
    if (byNameOrAlias.length === 1) {
      return { project: byNameOrAlias[0], note: 'resolved by explicit --project name/alias' };
    }

    if (byNameOrAlias.length > 1) {
      return { note: `explicit project is ambiguous (${byNameOrAlias.length} matches)` };
    }

    return { note: 'explicit project not found' };
  }

  const result = runtime.resolver.resolve({
    cwd,
    nonInteractive: false,
    ...getGitSignals(cwd)
  });

  if (!result.ok) {
    if (result.error === 'AMBIGUOUS') {
      return {
        note: `auto resolution ambiguous (${result.candidates?.length ?? 0} candidates)`
      };
    }

    return { note: 'project unresolved. Run register project (home option 6).' };
  }

  const project = runtime.projectRepo.getById(result.projectId);
  if (!project) {
    return { note: 'resolver returned unknown project id' };
  }

  return {
    project,
    note: `resolved by ${result.reason}`
  };
}

export function InteractiveMenu({ runtime, options, appVersion }: InteractiveMenuProps): React.JSX.Element {
  const { exit } = useApp();
  const [stack, setStack] = useState<ScreenId[]>(['home']);
  const [projectState, setProjectState] = useState<ProjectResolutionState>(() =>
    resolveProjectState(runtime, options)
  );

  const environment = options.env?.trim() || 'dev';
  const current = stack[stack.length - 1];

  const refreshProjectState = () => {
    setProjectState(resolveProjectState(runtime, options));
  };

  const navigate = (screen: ScreenId) => {
    setStack((prev) => [...prev, screen]);
  };

  const goBack = () => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === 'c') {
      exit();
    }
  });

  const sharedProps = useMemo(
    () => ({
      runtime,
      options,
      environment,
      projectState,
      onBack: goBack,
      onProjectStateChange: refreshProjectState
    }),
    [runtime, options, environment, projectState]
  );

  return (
    <Box flexDirection="column">
      <AppShell appVersion={appVersion}>
        {current === 'home' ? (
          <HomeScreen
            active={true}
            onNavigate={navigate}
            onExit={() => exit()}
          />
        ) : null}

        {current === 'generate-env' ? <GenerateEnvScreen active={true} {...sharedProps} /> : null}
        {current === 'current-project' ? <CurrentProjectScreen active={true} {...sharedProps} /> : null}
        {current === 'variables' ? <VariablesScreen active={true} {...sharedProps} /> : null}
        {current === 'search' ? <SearchScreen active={true} {...sharedProps} /> : null}
        {current === 'history-restore' ? <HistoryRestoreScreen active={true} {...sharedProps} /> : null}
        {current === 'register-project' ? <RegisterProjectScreen active={true} {...sharedProps} /> : null}
        {current === 'local-config' ? <LocalConfigScreen active={true} {...sharedProps} /> : null}
      </AppShell>
    </Box>
  );
}
