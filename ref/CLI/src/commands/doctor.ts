import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, printRows } from './runtime.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check age encryption tooling and key-source configuration (sops optional)')
    .action((...args: unknown[]) => {
      const command = args.at(-1) as Command;
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const diagnostics = runtime.diagnostics.run();
        const keySource = runtime.encryption.resolveKeySource();

        printRows(
          diagnostics.tools.map((tool) => ({
            tool: tool.name,
            level: tool.required ? 'required' : 'optional',
            available: tool.available,
            guidance: tool.available ? '' : tool.installGuidance.join(' | ')
          }))
        );

        if (keySource.source === 'none') {
          console.log('key-source: none');
        } else {
          console.log(`key-source: ${keySource.source} (${keySource.path})`);
        }
      } finally {
        closeRuntime(runtime);
      }
    });
}
