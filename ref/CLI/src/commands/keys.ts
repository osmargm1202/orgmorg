import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, printRows, resolveProjectId } from './runtime.js';

interface KeysOptions {
  key?: string;
}

export function registerKeysCommand(program: Command): void {
  program
    .command('keys')
    .description('List keys in latest snapshot or print one key')
    .option('--key <name>', 'print one key as KEY=VALUE')
    .action(async (options: KeysOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';

        if (options.key?.trim()) {
          const single = runtime.envGenerator.generate({
            projectId: projectId!,
            environment,
            mode: 'single-key',
            key: options.key
          });
          console.log(single.content);
          return;
        }

        const env = runtime.environmentRepo.getByName(projectId!, environment);
        if (!env) {
          console.log('(empty)');
          return;
        }

        const latest = runtime.variableRepo.getLatestSnapshot(projectId!, env.id);
        printRows(
          latest.map((entry) => ({
            key: entry.key,
            secret: entry.isSecret,
            sortOrder: entry.sortOrder
          }))
        );
      } finally {
        closeRuntime(runtime);
      }
    });
}
