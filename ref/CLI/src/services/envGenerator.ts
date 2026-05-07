import fs from 'node:fs';
import type { EnvironmentRepo } from '../db/repositories/environmentRepo.js';
import type { VariableRepo } from '../db/repositories/variableRepo.js';
import type { GenerateEnvInput, ShellFamily } from '../types/contracts.js';
import { renderEnvFile, renderEnvLines, renderShellExports } from '../utils/envFormat.js';
import { EncryptionService } from './encryption.js';

export interface EnvGeneratorResult {
  mode: GenerateEnvInput['mode'];
  content: string;
  outputPath?: string;
}

export class EnvGeneratorService {
  constructor(
    private readonly environmentRepo: EnvironmentRepo,
    private readonly variableRepo: VariableRepo,
    private readonly encryption: EncryptionService
  ) {}

  generate(input: GenerateEnvInput, shell: ShellFamily = 'bash'): EnvGeneratorResult {
    const environment = this.environmentRepo.getByName(input.projectId, input.environment);
    if (!environment) {
      throw new Error(`environment not found: ${input.environment}`);
    }

    const latestSnapshot = this.variableRepo.getLatestSnapshot(input.projectId, environment.id);
    const entries = latestSnapshot.map((entry) => ({
      key: entry.key,
      value: this.encryption.decryptForUse(entry.value),
      sortOrder: entry.sortOrder
    }));

    switch (input.mode) {
      case 'stdout': {
        return {
          mode: input.mode,
          content: renderEnvFile(entries)
        };
      }

      case 'file': {
        const outputPath = input.outputPath?.trim();
        if (!outputPath) {
          throw new Error('outputPath is required in file mode');
        }

        const content = renderEnvFile(entries);
        fs.writeFileSync(outputPath, content, 'utf8');
        return {
          mode: input.mode,
          content,
          outputPath
        };
      }

      case 'shell-export': {
        return {
          mode: input.mode,
          content: renderShellExports(entries, shell)
        };
      }

      case 'single-key': {
        const key = input.key?.trim();
        if (!key) {
          throw new Error('key is required in single-key mode');
        }

        const match = renderEnvLines(entries).find((line) => line.startsWith(`${key}=`));
        if (!match) {
          throw new Error(`key not found: ${key}`);
        }

        return {
          mode: input.mode,
          content: match
        };
      }

      default:
        throw new Error(`unsupported mode: ${(input as { mode: string }).mode}`);
    }
  }
}
