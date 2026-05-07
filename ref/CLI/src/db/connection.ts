import Database from 'better-sqlite3';
import { ensureOrgmenvDirs, resolveOrgmenvPaths } from '../utils/paths.js';

export interface DbConnectionOptions {
  dbPath?: string;
}

export function createConnection(options: DbConnectionOptions = {}): Database.Database {
  const resolvedPath = options.dbPath ?? resolveOrgmenvPaths().dbPath;

  ensureOrgmenvDirs();

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  return db;
}
