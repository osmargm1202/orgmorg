import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, resolveProjectId } from './runtime.js';

interface SetOptions {
  note?: string;
}

export function registerSetCommand(program: Command): void {
  program
    .command('set')
    .description('Set a variable and create a new snapshot version')
    .argument('<key>', 'variable key')
    .argument('<value>', 'variable value')
    .option('--note <text>', 'optional change note')
    .action(async (key: string, value: string, options: SetOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';
        const result = runtime.variableService.mutate({
          projectId: projectId!,
          environment,
          operation: 'set',
          key,
          value,
          sourceNote: options.note
        });

        console.log(`saved ${key} in ${environment}. version=${result.version.versionNumber}`);
        result.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
      } finally {
        closeRuntime(runtime);
      }
    });
}
