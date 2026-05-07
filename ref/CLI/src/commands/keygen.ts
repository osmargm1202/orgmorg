import path from 'node:path';
import type { Command } from 'commander';
import { generateAgeKeyFile } from '../services/keygen.js';
import { resolveEffectiveKeyState } from '../services/keyManagement.js';
import { resolveOrgmenvPaths } from '../utils/paths.js';
import { closeRuntime, createRuntime, getGlobalOptions } from './runtime.js';

interface KeygenOptions {
  output?: string;
}

export function registerKeygenCommand(program: Command): void {
  program
    .command('keygen')
    .description('Generate an age key file for default DB at-rest encryption')
    .option('--output <path>', 'output key file path')
    .action((options: KeygenOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const defaultPath = path.join(resolveOrgmenvPaths().configDir, 'keys', 'age.txt');
        const effectiveKeyState = resolveEffectiveKeyState(runtime.config.keyPath);
        const outputPath = generateAgeKeyFile(options.output?.trim() || effectiveKeyState.generationTargetPath || defaultPath);

        if (outputPath.reused) {
          console.log(`existing key reused at ${outputPath.path}`);
        } else {
          console.log(`key generated at ${outputPath.path}`);
        }
        console.log('next steps:');
        console.log(`- export AGE_KEY_FILE="${outputPath.path}"`);
        console.log(`- or set --key-path "${outputPath.path}" for commands`);
      } finally {
        closeRuntime(runtime);
      }
    });
}
