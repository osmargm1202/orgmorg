import type { ShellFamily } from '../types/contracts.js';

export function detectShellFamily(shellPath: string | undefined = process.env.SHELL): ShellFamily {
  if (!shellPath) {
    return 'unknown';
  }

  if (shellPath.includes('fish')) {
    return 'fish';
  }

  if (shellPath.includes('bash') || shellPath.includes('zsh') || shellPath.includes('sh')) {
    return 'bash';
  }

  return 'unknown';
}

export function renderExportLine(shell: ShellFamily, key: string, value: string): string {
  const quoted = JSON.stringify(value);

  if (shell === 'fish') {
    return `set -gx ${key} ${quoted};`;
  }

  return `export ${key}=${quoted}`;
}
