import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, printRows } from './runtime.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search')
    .description('Search keys across project snapshots and global variables')
    .argument('<query>', 'search term')
    .action((query: string, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const result = runtime.globalVariableService.search(query);
        printRows(
          result.values.map((entry) => ({
            scope: entry.scope,
            alias: entry.alias,
            projectId: entry.projectId,
            environment: entry.environment,
            key: entry.key,
            valuePreview: entry.valuePreview
          }))
        );
      } finally {
        closeRuntime(runtime);
      }
    });
}
