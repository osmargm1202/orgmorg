import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { OptionList, type OptionItem } from '../components/common/OptionList.js';
import type { InteractiveScreenProps } from '../types.js';
import { PRIMARY_THEME_COLOR } from '../theme.js';
import { resolveNumericSelection } from '../utils/input.js';

type Stage = 'destination' | 'select-files' | 'render-output';
type DestinationMode = 'screen' | 'file';

interface GenerateEnvScreenProps extends InteractiveScreenProps {
  active: boolean;
}

export function GenerateEnvScreen({
  active,
  runtime,
  environment,
  projectState,
  onBack
}: GenerateEnvScreenProps): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('destination');
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('screen');
  const [destinationSelectedIndex, setDestinationSelectedIndex] = useState(0);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('Choose destination mode to start generation.');
  const [generatedOutput, setGeneratedOutput] = useState<
    Array<{ id: string; fileName: string; fileType: string; outputPath: string; content: string }>
  >([]);

  const projectId = projectState.project?.id;

  const destinationActions: OptionItem[] = [
    { id: 'screen', label: 'Render generated files on screen', tone: 'safe' },
    { id: 'file', label: 'Write generated files to stored output paths', tone: 'safe' },
    { id: 'back', label: 'Back', tone: 'safe' }
  ];

  const artifacts = projectId
    ? runtime.importedArtifactService.listByProjectEnvironment({
        projectId,
        environment
      })
    : [];

  const fileActions = useMemo<OptionItem[]>(
    () => [
      { id: 'generate-all', label: 'Generate all stored files', tone: 'safe' },
      ...artifacts.map((artifact) => ({
        id: artifact.id,
        label: `${artifact.fileName} (${artifact.fileType}) -> ${artifact.sourcePath}`,
        tone: 'safe' as const
      }))
    ],
    [artifacts]
  );

  const toggleSelection = (actionId: string) => {
    if (actionId === 'generate-all') {
      if (selectedFileIds.size === artifacts.length) {
        setSelectedFileIds(new Set());
        return;
      }

      setSelectedFileIds(new Set(artifacts.map((artifact) => artifact.id)));
      return;
    }

    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const runGeneration = (focusedActionId: string) => {
    if (!projectId) {
      setStatus('No resolved project. Register/select a project first.');
      return;
    }

    if (artifacts.length === 0) {
      setStatus(`No stored artifacts for env=${environment}. Import files first from Variables screen.`);
      return;
    }

    const hasManualSelection = selectedFileIds.size > 0;
    const generateAll = hasManualSelection
      ? selectedFileIds.size === artifacts.length
      : focusedActionId === 'generate-all';
    const artifactIds = hasManualSelection
      ? Array.from(selectedFileIds)
      : focusedActionId === 'generate-all'
        ? []
        : [focusedActionId];

    const generated = runtime.importedArtifactService.generate({
      projectId,
      environment,
      mode: destinationMode,
      generateAll,
      artifactIds
    });

    setGeneratedOutput(generated);
    setStage('render-output');
    setStatus(
      destinationMode === 'screen'
        ? `Rendered ${generated.length} file(s) on screen.`
        : `Wrote ${generated.length} file(s) to output paths.`
    );
  };

  const runDestinationAction = (actionId: string) => {
    if (actionId === 'back') {
      onBack();
      return;
    }

    setDestinationMode(actionId as DestinationMode);
    setSelectedFileIds(new Set());
    setFileSelectedIndex(0);
    setStage('select-files');
    setStatus(`Destination mode selected: ${actionId}. Choose files and press Enter to generate.`);
  };

  useInput(
    (input, key) => {
      if (key.escape || input.toLowerCase() === 'b') {
        if (stage === 'render-output') {
          setStage('select-files');
          return;
        }

        if (stage === 'select-files') {
          setStage('destination');
          return;
        }

        onBack();
        return;
      }

      if (stage === 'destination') {
        if (key.downArrow) {
          setDestinationSelectedIndex((prev) => (prev + 1) % destinationActions.length);
          return;
        }

        if (key.upArrow) {
          setDestinationSelectedIndex((prev) => (prev - 1 + destinationActions.length) % destinationActions.length);
          return;
        }

        const numericSelection = resolveNumericSelection(input, destinationActions.length);
        if (numericSelection !== undefined) {
          runDestinationAction(destinationActions[numericSelection].id);
          return;
        }

        if (key.return) {
          runDestinationAction(destinationActions[destinationSelectedIndex].id);
        }

        return;
      }

      if (stage === 'select-files') {
        if (key.downArrow) {
          setFileSelectedIndex((prev) => (prev + 1) % Math.max(fileActions.length, 1));
          return;
        }

        if (key.upArrow) {
          setFileSelectedIndex((prev) => (prev - 1 + Math.max(fileActions.length, 1)) % Math.max(fileActions.length, 1));
          return;
        }

        if (input === ' ') {
          const action = fileActions[fileSelectedIndex];
          if (action) {
            toggleSelection(action.id);
          }
          return;
        }

        if (input.toLowerCase() === 'a') {
          toggleSelection('generate-all');
          return;
        }

        const numericSelection = resolveNumericSelection(input, fileActions.length);
        if (numericSelection !== undefined) {
          const action = fileActions[numericSelection];
          if (action) {
            runGeneration(action.id);
          }
          return;
        }

        if (key.return) {
          const action = fileActions[fileSelectedIndex];
          if (action) {
            runGeneration(action.id);
          }
        }
      }
    },
    { isActive: active }
  );

  const statusColor: 'greenBright' | 'redBright' = status.startsWith('No ') ? 'redBright' : 'greenBright';

  const renderFileActionLabel = (item: OptionItem): string => {
    if (item.id === 'generate-all') {
      return `${selectedFileIds.size === artifacts.length && artifacts.length > 0 ? '[x]' : '[ ]'} ${item.label}`;
    }

    return `${selectedFileIds.has(item.id) ? '[x]' : '[ ]'} ${item.label}`;
  };

  return (
    <Box flexDirection="column">
      <Text color={PRIMARY_THEME_COLOR} bold>
        Generate files
      </Text>
      <Text color="gray">Keyboard first · Space select · Enter generate · b/esc back</Text>
      <Box marginTop={1}>
        <Text color={statusColor}>status: {status}</Text>
      </Box>
      <Text color="gray">project: {projectState.project?.name ?? '(unresolved)'} · env: {environment}</Text>

      {stage === 'destination' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">STEP 1 · DESTINATION MODE</Text>
          <OptionList items={destinationActions} selectedIndex={destinationSelectedIndex} />
        </Box>
      ) : null}

      {stage === 'select-files' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">STEP 2 · SELECT FILES ({artifacts.length} stored)</Text>
          {fileActions.map((item, index) => {
            const selected = index === fileSelectedIndex;
            return (
              <Text key={item.id} color={selected ? PRIMARY_THEME_COLOR : 'gray'} bold={selected}>
                {selected ? '>' : ' '} {index + 1}. {renderFileActionLabel(item)}
              </Text>
            );
          })}
          <Text color="gray">
            selected: {selectedFileIds.size} · destination: {destinationMode} · tip: press "a" to toggle all
          </Text>
        </Box>
      ) : null}

      {stage === 'render-output' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">STEP 3 · GENERATED OUTPUT ({generatedOutput.length})</Text>
          {generatedOutput.length === 0 ? <Text color="gray">(empty)</Text> : null}
          {generatedOutput.map((entry) => (
            <Box key={entry.id} flexDirection="column" marginBottom={1}>
              <Text>
                {entry.fileName} ({entry.fileType}){destinationMode === 'file' ? ` -> ${entry.outputPath}` : ''}
              </Text>
              {destinationMode === 'screen' ? <Text>{entry.content}</Text> : null}
            </Box>
          ))}
          <Text color="gray">Press b/esc to return to file selection.</Text>
        </Box>
      ) : null}
    </Box>
  );
}
