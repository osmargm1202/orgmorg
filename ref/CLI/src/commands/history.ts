import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, printRows, resolveProjectId } from './runtime.js';

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('Show snapshot history for resolved project/environment')
    .action(async (...args: unknown[]) => {
      const command = args.at(-1) as Command;
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environmentName = globalOptions.env?.trim() || 'dev';
        const environment = runtime.environmentRepo.getByName(projectId!, environmentName);

        if (!environment) {
          console.log('(empty)');
          return;
        }

        const history = runtime.versionRepo.history(projectId!, environment.id);
        printRows(
          history.map((version) => ({
            version: version.versionNumber,
            createdAt: version.createdAt,
            source: version.sourceType,
            note: version.changeNote
          }))
        );
      } finally {
        closeRuntime(runtime);
      }
    });
}
