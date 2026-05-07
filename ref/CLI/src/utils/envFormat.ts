import type { ShellFamily } from '../types/contracts.js';
import { renderExportLine } from './terminal.js';

export interface EnvEntry {
  key: string;
  value: string;
  sortOrder?: number;
}

export function escapeEnvValue(value: string): string {
  if (value.includes('\n') || value.includes(' ') || value.includes('#') || value.includes('"')) {
    return JSON.stringify(value);
  }

  return value;
}

export function sortEnvEntries(entries: EnvEntry[]): EnvEntry[] {
  return [...entries].sort((a, b) => {
    const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (aSort !== bSort) {
      return aSort - bSort;
    }

    return a.key.localeCompare(b.key);
  });
}

export function renderEnvLines(entries: EnvEntry[]): string[] {
  return sortEnvEntries(entries).map((entry) => `${entry.key}=${escapeEnvValue(entry.value)}`);
}

export function renderEnvFile(entries: EnvEntry[]): string {
  return renderEnvLines(entries).join('\n');
}

export function renderShellExports(entries: EnvEntry[], shell: ShellFamily): string {
  return sortEnvEntries(entries)
    .map((entry) => renderExportLine(shell, entry.key, entry.value))
    .join('\n');
}
