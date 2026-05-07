import type { Command } from 'commander';
import {
  closeRuntime,
  createRuntime,
  getGlobalOptions,
  printRows,
  resolveProjectId
} from './runtime.js';

export function registerEnvsCommand(program: Command): void {
  program
    .command('envs')
    .description('List environments for the resolved project')
    .action(async (...args: unknown[]) => {
      const command = args.at(-1) as Command;
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const envs = runtime.environmentRepo.list(projectId!);
        printRows(
          envs.map((env) => ({
            environment: env.name,
            id: env.id,
            updatedAt: env.updatedAt
          }))
        );
      } finally {
        closeRuntime(runtime);
      }
    });
}
