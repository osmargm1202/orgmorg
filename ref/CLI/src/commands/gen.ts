import type { Command } from 'commander';
import type { GenerateEnvInput } from '../types/contracts.js';
import {
  buildCommandContext,
  closeRuntime,
  createRuntime,
  getGlobalOptions,
  resolveProjectId
} from './runtime.js';

interface GenOptions {
  stdout?: boolean;
  output?: string;
  export?: boolean;
  key?: string;
}

function resolveMode(options: GenOptions): GenerateEnvInput['mode'] {
  if (options.key?.trim()) {
    return 'single-key';
  }

  if (options.output?.trim()) {
    return 'file';
  }

  if (options.export) {
    return 'shell-export';
  }

  return 'stdout';
}

export function registerGenCommand(program: Command): void {
  program
    .command('gen')
    .description('Generate env output to stdout, file, exports, or single key')
    .option('--stdout', 'render to stdout (default when no output option is provided)')
    .option('--output <path>', 'write env output to a file')
    .option('--export', 'render shell export syntax')
    .option('--key <name>', 'render only one key in KEY=VALUE format')
    .action(async (options: GenOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';
        const context = await buildCommandContext(runtime, globalOptions, true);

        const result = runtime.envGenerator.generate({
          projectId: projectId!,
          environment,
          mode: resolveMode(options),
          outputPath: options.output,
          key: options.key
        }, context.shell);

        if (result.mode === 'file') {
          console.log(`env written to ${result.outputPath}`);
          return;
        }

        console.log(result.content);
      } finally {
        closeRuntime(runtime);
      }
    });
}
