import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { GlobalVariable } from '../../types/domain.js';

interface GlobalVariableRow {
  id: string;
  alias: string;
  key: string;
  value: string;
  is_secret: number;
  encrypted: number;
  created_at: string;
  updated_at: string;
}

function toGlobalVariable(row: GlobalVariableRow): GlobalVariable {
  return {
    id: row.id,
    alias: row.alias,
    key: row.key,
    value: row.value,
    isSecret: row.is_secret === 1,
    encrypted: row.encrypted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface UpsertGlobalVariableInput {
  alias: string;
  key: string;
  value: string;
  encrypted?: boolean;
  isSecret?: boolean;
}

export class GlobalVariableRepo {
  constructor(private readonly db: Database.Database) {}

  upsert(input: UpsertGlobalVariableInput): GlobalVariable {
    const alias = input.alias.trim();
    if (!alias) {
      throw new Error('alias is required for global variables');
    }

    const now = new Date().toISOString();

    const existing = this.db
      .prepare('SELECT id, created_at FROM global_variables WHERE alias = ? AND key = ? LIMIT 1')
      .get(alias, input.key) as { id: string; created_at: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE global_variables
          SET value = ?, is_secret = ?, encrypted = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          input.value,
          input.isSecret === false ? 0 : 1,
          input.encrypted === false ? 0 : 1,
          now,
          existing.id
        );

      const row = this.db
        .prepare('SELECT * FROM global_variables WHERE id = ? LIMIT 1')
        .get(existing.id) as GlobalVariableRow;

      return toGlobalVariable(row);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO global_variables (
          id, alias, key, value, is_secret, encrypted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        alias,
        input.key,
        input.value,
        input.isSecret === false ? 0 : 1,
        input.encrypted === false ? 0 : 1,
        now,
        now
      );

    const created = this.db
      .prepare('SELECT * FROM global_variables WHERE id = ? LIMIT 1')
      .get(id) as GlobalVariableRow;

    return toGlobalVariable(created);
  }

  list(): GlobalVariable[] {
    const rows = this.db
      .prepare('SELECT * FROM global_variables ORDER BY alias ASC, key ASC')
      .all() as GlobalVariableRow[];
    return rows.map(toGlobalVariable);
  }

  search(query: string): GlobalVariable[] {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM global_variables
        WHERE key LIKE ? OR alias LIKE ?
        ORDER BY updated_at DESC
      `
      )
      .all(like, like) as GlobalVariableRow[];

    return rows.map(toGlobalVariable);
  }
}
