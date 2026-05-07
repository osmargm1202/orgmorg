import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveAgeKeyGenerationTarget } from './keyManagement.js';

export interface GenerateAgeKeyFileResult {
  path: string;
  created: boolean;
  reused: boolean;
}

export function generateAgeKeyFile(outputPath: string): GenerateAgeKeyFileResult {
  const resolvedRequest = path.resolve(outputPath);
  const target = resolveAgeKeyGenerationTarget(resolvedRequest);

  if (target.existingKeyPath) {
    return {
      path: target.existingKeyPath,
      created: false,
      reused: true
    };
  }

  fs.mkdirSync(path.dirname(target.targetFilePath), { recursive: true, mode: 0o700 });

  const result = spawnSync('age-keygen', ['-o', target.targetFilePath], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    if (fs.existsSync(target.targetFilePath)) {
      try {
        fs.unlinkSync(target.targetFilePath);
      } catch {
        // best-effort cleanup only
      }
    }

    const stderr = result.stderr?.trim();
    const message = stderr || `age-keygen exited with status ${result.status ?? 'unknown'}`;
    throw new Error(`failed to generate age key: ${message}`);
  }

  fs.chmodSync(target.targetFilePath, 0o600);
  return {
    path: target.targetFilePath,
    created: true,
    reused: false
  };
}
