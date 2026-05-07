import type { Command } from 'commander';
import { confirm } from '../utils/confirm.js';
import { closeRuntime, createRuntime, getGlobalOptions, resolveProjectId } from './runtime.js';

interface UnsetOptions {
  note?: string;
}

export function registerUnsetCommand(program: Command): void {
  program
    .command('unset')
    .description('Unset a variable key and create a new snapshot version')
    .argument('<key>', 'variable key')
    .option('--note <text>', 'optional change note')
    .action(async (key: string, options: UnsetOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';

        const proceed = await confirm({
          message: `Unset ${key} from ${environment}?`,
          nonInteractive: globalOptions.noconfirm === true,
          defaultValue: true
        });

        if (!proceed) {
          throw new Error('operation canceled');
        }

        const result = runtime.variableService.mutate({
          projectId: projectId!,
          environment,
          operation: 'unset',
          key,
          sourceNote: options.note
        });

        console.log(`removed ${key} from ${environment}. version=${result.version.versionNumber}`);
      } finally {
        closeRuntime(runtime);
      }
    });
}
