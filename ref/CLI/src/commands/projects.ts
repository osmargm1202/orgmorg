import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, printRows } from './runtime.js';

export function registerProjectsCommand(program: Command): void {
  program
    .command('projects')
    .description('List registered projects')
    .action((...args: unknown[]) => {
      const command = args.at(-1) as Command;
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projects = runtime.projectRepo.list();
        printRows(
          projects.map((project) => ({
            id: project.id,
            name: project.name,
            alias: project.alias,
            rootPath: project.rootPath,
            updatedAt: project.updatedAt
          }))
        );
      } finally {
        closeRuntime(runtime);
      }
    });
}
