#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerEnvsCommand } from './commands/envs.js';
import { registerGenCommand } from './commands/gen.js';
import { registerHistoryCommand } from './commands/history.js';
import { registerImportCommand } from './commands/import.js';
import { registerInitCommand } from './commands/init.js';
import { registerInstructionsCommand } from './commands/instructions.js';
import { registerKeygenCommand } from './commands/keygen.js';
import { registerKeysCommand } from './commands/keys.js';
import { registerProjectsCommand } from './commands/projects.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerSearchCommand } from './commands/search.js';
import { registerSetCommand } from './commands/set.js';
import { registerShowCommand } from './commands/show.js';
import { registerUnsetCommand } from './commands/unset.js';
import { launchInteractiveApp } from './app.js';
import type { GlobalCliOptions } from './commands/runtime.js';

const OPTIONS_WITH_VALUE = new Set(['--project', '--env', '--db-path', '--key-path']);

function readOptionValue(token: string, rawArgs: string[], index: number): { value?: string; nextIndex: number } {
  const withEquals = token.match(/^--[^=]+=(.*)$/);
  if (withEquals) {
    return { value: withEquals[1], nextIndex: index };
  }

  if (index + 1 >= rawArgs.length) {
    return { nextIndex: index };
  }

  return {
    value: rawArgs[index + 1],
    nextIndex: index + 1
  };
}

export function parseInteractiveOptions(rawArgs: string[]): GlobalCliOptions {
  const options: GlobalCliOptions = {};

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];

    if (token === '--project' || token.startsWith('--project=')) {
      const { value, nextIndex } = readOptionValue(token, rawArgs, i);
      options.project = value;
      i = nextIndex;
      continue;
    }

    if (token === '--env' || token.startsWith('--env=')) {
      const { value, nextIndex } = readOptionValue(token, rawArgs, i);
      options.env = value;
      i = nextIndex;
      continue;
    }

    if (token === '--db-path' || token.startsWith('--db-path=')) {
      const { value, nextIndex } = readOptionValue(token, rawArgs, i);
      options.dbPath = value;
      i = nextIndex;
      continue;
    }

    if (token === '--key-path' || token.startsWith('--key-path=')) {
      const { value, nextIndex } = readOptionValue(token, rawArgs, i);
      options.keyPath = value;
      i = nextIndex;
      continue;
    }

    if (token === '--noconfirm') {
      options.noconfirm = true;
      continue;
    }

    if (token === '--no-encryption') {
      options.encryption = false;
      continue;
    }

    if (token === '--encryption') {
      options.encryption = true;
      continue;
    }
  }

  return options;
}

export function detectSubcommand(rawArgs: string[]): string | undefined {
  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];
    if (!token) {
      continue;
    }

    if (token.startsWith('--')) {
      const optionKey = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
      if (OPTIONS_WITH_VALUE.has(optionKey) && !token.includes('=')) {
        i += 1;
      }
      continue;
    }

    if (token.startsWith('-')) {
      continue;
    }

    return token;
  }

  return undefined;
}

function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerProjectsCommand(program);
  registerEnvsCommand(program);
  registerShowCommand(program);
  registerSetCommand(program);
  registerUnsetCommand(program);
  registerImportCommand(program);
  registerHistoryCommand(program);
  registerRestoreCommand(program);
  registerGenCommand(program);
  registerKeysCommand(program);
  registerSearchCommand(program);
  registerDoctorCommand(program);
  registerKeygenCommand(program);
  registerInstructionsCommand(program);
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name('orgmenv')
    .description('Local-first secret and env snapshot manager')
    .version('1.1.0')
    .showHelpAfterError()
    .option('--project <id|name|alias>', 'target project')
    .option('--env <name>', 'target environment', 'dev')
    .option('--noconfirm', 'disable prompts for deterministic execution')
    .option('--db-path <path>', 'override sqlite database path')
    .option('--key-path <path>', 'fallback age key path when AGE_KEY_FILE is unset')
    .option('--no-encryption', 'store plaintext values (disables default age at-rest encryption)');

  registerCommands(program);
  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  const rawArgs = argv.slice(2);
  const asksHelpOrVersion = rawArgs.some((arg) =>
    ['--help', '-h', '--version', '-V'].includes(arg)
  );
  const hasSubcommand = Boolean(detectSubcommand(rawArgs));

  if (!asksHelpOrVersion && !hasSubcommand) {
    await launchInteractiveApp(parseInteractiveOptions(rawArgs));
    return;
  }

  await program.parseAsync(argv);
}

function isExecutedAsMain(): boolean {
  const argvEntry = process.argv[1];
  if (!argvEntry) {
    return false;
  }

  const modulePath = fileURLToPath(import.meta.url);

  try {
    return realpathSync(modulePath) === realpathSync(argvEntry);
  } catch {
    return modulePath === argvEntry;
  }
}

const isMainModule = isExecutedAsMain();

if (isMainModule) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  });
}
