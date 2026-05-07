import fs from 'node:fs';
import path from 'node:path';
import { resolveOrgmenvPaths } from '../utils/paths.js';

export const AGE_PRIVATE_KEY_PREFIX = 'AGE-SECRET-KEY-';
export const DEFAULT_AGE_KEY_FILENAME = 'age.txt';

export type EffectiveKeyStateStatus = 'configured' | 'missing' | 'unconfigured';

export interface AgeKeyGenerationTarget {
  requestedPath: string;
  targetFilePath: string;
  existingKeyPath?: string;
}

export interface EffectiveKeyState {
  source: 'env' | 'config' | 'none';
  configuredPath?: string;
  existingKeyPath?: string;
  status: EffectiveKeyStateStatus;
  generationTargetPath: string;
}

function isDirectoryPathHint(inputPath: string): boolean {
  return inputPath.endsWith(path.sep) || inputPath.endsWith('/') || path.extname(inputPath) === '';
}

export function isExistingAgeKeyFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes(AGE_PRIVATE_KEY_PREFIX);
  } catch {
    return false;
  }
}

export function findExistingAgeKeyInDirectory(directoryPath: string): string | undefined {
  try {
    if (!fs.existsSync(directoryPath)) {
      return undefined;
    }

    const stats = fs.statSync(directoryPath);
    if (!stats.isDirectory()) {
      return undefined;
    }

    const candidates = fs.readdirSync(directoryPath).sort((a, b) => a.localeCompare(b));
    for (const candidate of candidates) {
      const candidatePath = path.join(directoryPath, candidate);
      if (isExistingAgeKeyFile(candidatePath)) {
        return candidatePath;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function resolveAgeKeyGenerationTarget(requestedPath: string): AgeKeyGenerationTarget {
  const resolvedPath = path.resolve(requestedPath);

  if (fs.existsSync(resolvedPath)) {
    const stats = fs.statSync(resolvedPath);

    if (stats.isDirectory()) {
      const existingKeyPath = findExistingAgeKeyInDirectory(resolvedPath);
      return {
        requestedPath,
        targetFilePath: existingKeyPath ?? path.join(resolvedPath, DEFAULT_AGE_KEY_FILENAME),
        existingKeyPath
      };
    }

    const existingKeyPath = isExistingAgeKeyFile(resolvedPath) ? resolvedPath : undefined;
    return {
      requestedPath,
      targetFilePath: resolvedPath,
      existingKeyPath
    };
  }

  if (isDirectoryPathHint(requestedPath)) {
    const existingKeyPath = findExistingAgeKeyInDirectory(resolvedPath);
    return {
      requestedPath,
      targetFilePath: existingKeyPath ?? path.join(resolvedPath, DEFAULT_AGE_KEY_FILENAME),
      existingKeyPath
    };
  }

  return {
    requestedPath,
    targetFilePath: resolvedPath
  };
}

export function resolveEffectiveKeyState(configKeyPath?: string): EffectiveKeyState {
  const envPath = process.env.AGE_KEY_FILE?.trim();
  const fallbackPath = configKeyPath?.trim();

  if (envPath) {
    const target = resolveAgeKeyGenerationTarget(envPath);
    return {
      source: 'env',
      configuredPath: envPath,
      existingKeyPath: target.existingKeyPath,
      status: target.existingKeyPath ? 'configured' : 'missing',
      generationTargetPath: target.targetFilePath
    };
  }

  if (fallbackPath) {
    const target = resolveAgeKeyGenerationTarget(fallbackPath);
    return {
      source: 'config',
      configuredPath: fallbackPath,
      existingKeyPath: target.existingKeyPath,
      status: target.existingKeyPath ? 'configured' : 'missing',
      generationTargetPath: target.targetFilePath
    };
  }

  const defaultPath = path.join(resolveOrgmenvPaths().configDir, 'keys', DEFAULT_AGE_KEY_FILENAME);
  const target = resolveAgeKeyGenerationTarget(defaultPath);
  return {
    source: 'none',
    existingKeyPath: target.existingKeyPath,
    status: 'unconfigured',
    generationTargetPath: target.targetFilePath
  };
}
