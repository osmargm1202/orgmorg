import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR_NAME = 'orgmenv';

export interface OrgmenvPaths {
  configDir: string;
  dbPath: string;
  backupsDir: string;
  cacheDir: string;
}

export function resolveOrgmenvPaths(): OrgmenvPaths {
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  const configDir = path.join(configHome, APP_DIR_NAME);

  return {
    configDir,
    dbPath: path.join(configDir, 'orgmenv.db'),
    backupsDir: path.join(configDir, 'backups'),
    cacheDir: path.join(configDir, 'cache')
  };
}

export function ensureOrgmenvDirs(paths: OrgmenvPaths = resolveOrgmenvPaths()): OrgmenvPaths {
  fs.mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.backupsDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.cacheDir, { recursive: true, mode: 0o700 });

  return paths;
}

export function resolveKeyPath(configKeyPath?: string): string | undefined {
  const fromEnv = process.env.AGE_KEY_FILE;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv;
  }

  if (configKeyPath && configKeyPath.trim()) {
    return configKeyPath;
  }

  return undefined;
}
