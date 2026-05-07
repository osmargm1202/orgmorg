import type { Command } from 'commander';
import { confirm } from '../utils/confirm.js';
import { closeRuntime, createRuntime, getGlobalOptions, resolveProjectId } from './runtime.js';

interface RestoreOptions {
  version: string;
  note?: string;
}

export function registerRestoreCommand(program: Command): void {
  program
    .command('restore')
    .description('Restore a historical version by creating a new latest snapshot')
    .requiredOption('--version <number>', 'target historical version number')
    .option('--note <text>', 'optional change note')
    .action(async (options: RestoreOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';
        const targetVersion = Number.parseInt(options.version, 10);

        if (!Number.isInteger(targetVersion) || targetVersion < 1) {
          throw new Error('--version must be a positive integer');
        }

        const proceed = await confirm({
          message: `Restore ${environment} to version ${targetVersion}?`,
          nonInteractive: globalOptions.noconfirm === true,
          defaultValue: true
        });

        if (!proceed) {
          throw new Error('operation canceled');
        }

        const created = runtime.versioning.restoreSnapshot({
          projectId: projectId!,
          environment,
          versionNumber: targetVersion,
          sourceNote: options.note
        });

        console.log(`restored version ${targetVersion}. new version=${created.versionNumber}`);
      } finally {
        closeRuntime(runtime);
      }
    });
}
