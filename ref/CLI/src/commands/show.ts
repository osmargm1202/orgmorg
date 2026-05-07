import type { Command } from 'commander';
import { detectShellFamily } from '../utils/terminal.js';
import {
  buildCommandContext,
  closeRuntime,
  createRuntime,
  getGlobalOptions,
  resolveProjectId
} from './runtime.js';

export function registerShowCommand(program: Command): void {
  program
    .command('show')
    .description('Show resolved runtime context and active project/environment')
    .action(async (...args: unknown[]) => {
      const command = args.at(-1) as Command;
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, false);
        const project = projectId ? runtime.projectRepo.getById(projectId) : undefined;
        const context = await buildCommandContext(runtime, globalOptions, false);

        console.log(`cwd: ${context.cwd}`);
        console.log(`shell: ${detectShellFamily()}`);
        console.log(`dbPath: ${context.config.dbPath}`);
        console.log(`encryption: ${context.config.useEncryption ? 'enabled' : 'disabled'}`);
        console.log(`project: ${project ? `${project.name} (${project.id})` : 'unresolved'}`);
        console.log(`environment: ${globalOptions.env?.trim() || 'dev'}`);
      } finally {
        closeRuntime(runtime);
      }
    });
}
