import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { InteractiveScreenProps } from '../types.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';

interface CurrentProjectScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function CurrentProjectScreen({
  active,
  runtime,
  projectState,
  onBack,
  onProjectStateChange
}: CurrentProjectScreenProps): React.JSX.Element {
  useInput(
    (input, key) => {
      if (key.escape || input.toLowerCase() === 'b') {
        onBack();
        return;
      }

      if (input.toLowerCase() === 'r') {
        onProjectStateChange();
      }
    },
    { isActive: active }
  );

  const projects = runtime.projectRepo.list();

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Current project
      </Text>
      <Text color="gray">r refresh · b/esc back</Text>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">RESOLUTION</Text>
        <Text>
          resolved: {projectState.project ? `${projectState.project.name} (${projectState.project.id})` : 'unresolved'}
        </Text>
        {projectState.project?.alias ? <Text>alias: {projectState.project.alias}</Text> : null}
        {projectState.project?.rootPath ? <Text>root: {projectState.project.rootPath}</Text> : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">REGISTERED PROJECTS</Text>
        {projects.length === 0 ? <Text color="gray">(empty)</Text> : null}
        {projects.slice(0, 8).map((project) => (
          <Text key={project.id}>
            - {project.name} · {project.id}
            {project.alias ? ` · alias=${project.alias}` : ''}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
