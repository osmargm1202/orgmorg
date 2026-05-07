import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

const FALLBACK_INSTRUCTIONS = `orgmenv instructions

The local instructions document is not available from this installation.

Quick help:
- Run orgmenv --help to discover commands
- Run orgmenv in interactive mode for guided workflows
- Read README.md from the package repository for full documentation
`;

export function resolveInstructionsDocPath(): string | undefined {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, '../../docs/INSTRUCTIONS.md'),
    path.resolve(moduleDirectory, '../../../docs/INSTRUCTIONS.md')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function readInstructionsText(): string {
  const docsPath = resolveInstructionsDocPath();
  if (!docsPath) {
    return FALLBACK_INSTRUCTIONS;
  }

  const content = fs.readFileSync(docsPath, 'utf8').trim();
  return content || FALLBACK_INSTRUCTIONS;
}

export function registerInstructionsCommand(program: Command): void {
  program
    .command('instructions')
    .description('Show extended local guidance packaged with orgmenv')
    .action(() => {
      console.log(readInstructionsText());
    });
}
