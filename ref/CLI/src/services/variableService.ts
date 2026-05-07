import type { SnapshotEntry } from '../db/repositories/variableRepo.js';
import type { SnapshotVersion, VariableMutationInput } from '../types/contracts.js';
import { EncryptionService } from './encryption.js';
import { VersioningService } from './versioning.js';

function ensureKey(key: string | undefined): string {
  const normalized = key?.trim();
  if (!normalized) {
    throw new Error('key is required');
  }

  return normalized;
}

function toSnapshotEntryMap(entries: SnapshotEntry[]): Map<string, SnapshotEntry> {
  const map = new Map<string, SnapshotEntry>();
  entries.forEach((entry, index) => {
    map.set(entry.key, {
      key: entry.key,
      value: entry.value,
      isSecret: entry.isSecret,
      sortOrder: entry.sortOrder ?? index
    });
  });
  return map;
}

function fromMap(entries: Map<string, SnapshotEntry>): SnapshotEntry[] {
  return [...entries.values()].sort((a, b) => {
    const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (aSort !== bSort) {
      return aSort - bSort;
    }

    return a.key.localeCompare(b.key);
  });
}

export interface VariableMutationResult {
  version: SnapshotVersion;
  warnings: string[];
}

export class VariableService {
  constructor(
    private readonly versioning: VersioningService,
    private readonly encryption: EncryptionService
  ) {}

  mutate(input: VariableMutationInput): VariableMutationResult {
    const latest = this.versioning.getLatestSnapshot(input.projectId, input.environment);
    const currentMap = toSnapshotEntryMap(
      latest.entries.map((entry) => ({
        key: entry.key,
        value: entry.value,
        isSecret: entry.isSecret,
        sortOrder: entry.sortOrder
      }))
    );

    const warnings: string[] = [];

    switch (input.operation) {
      case 'set': {
        const key = ensureKey(input.key);
        const value = input.value ?? '';
        const encrypted = this.encryption.encryptForStorage(value);
        if (encrypted.warning) {
          warnings.push(encrypted.warning);
        }

        const existing = currentMap.get(key);
        currentMap.set(key, {
          key,
          value: encrypted.value,
          isSecret: true,
          sortOrder: existing?.sortOrder ?? currentMap.size
        });
        break;
      }

      case 'unset': {
        const key = ensureKey(input.key);
        currentMap.delete(key);
        break;
      }

      case 'import': {
        const entries = input.importEntries ?? [];
        if (entries.length === 0) {
          throw new Error('import entries are required');
        }

        const mode = input.mergeMode ?? 'merge';
        const targetMap = mode === 'replace' ? new Map<string, SnapshotEntry>() : currentMap;

        entries.forEach((entry, index) => {
          const key = ensureKey(entry.key);
          const encrypted = this.encryption.encryptForStorage(entry.value);
          if (encrypted.warning) {
            warnings.push(encrypted.warning);
          }

          const existing = targetMap.get(key);
          targetMap.set(key, {
            key,
            value: encrypted.value,
            isSecret: true,
            sortOrder: existing?.sortOrder ?? index
          });
        });

        if (mode === 'replace') {
          currentMap.clear();
          targetMap.forEach((value, key) => {
            currentMap.set(key, value);
          });
        }
        break;
      }

      default:
        throw new Error(`unsupported operation: ${(input as { operation: string }).operation}`);
    }

    const version = this.versioning.createSnapshot({
      projectId: input.projectId,
      environment: input.environment,
      sourceType: input.sourceType ?? (input.operation === 'import' ? 'import' : 'update'),
      sourceNote: input.sourceNote,
      entries: fromMap(currentMap)
    });

    return { version, warnings };
  }
}
