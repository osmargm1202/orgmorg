import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Environment } from '../../types/domain.js';

interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function toEnvironment(row: EnvironmentRow): Environment {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class EnvironmentRepo {
  constructor(private readonly db: Database.Database) {}

  ensure(projectId: string, name: string): Environment {
    const existing = this.getByName(projectId, name);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    this.db
      .prepare(
        'INSERT INTO environments (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, projectId, name, now, now);

    const created = this.getById(id);
    if (!created) {
      throw new Error('Failed to create environment');
    }

    return created;
  }

  list(projectId: string): Environment[] {
    const rows = this.db
      .prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY name ASC')
      .all(projectId) as EnvironmentRow[];

    return rows.map(toEnvironment);
  }

  getById(id: string): Environment | undefined {
    const row = this.db.prepare('SELECT * FROM environments WHERE id = ? LIMIT 1').get(id) as
      | EnvironmentRow
      | undefined;
    return row ? toEnvironment(row) : undefined;
  }

  getByName(projectId: string, name: string): Environment | undefined {
    const row = this.db
      .prepare('SELECT * FROM environments WHERE project_id = ? AND name = ? LIMIT 1')
      .get(projectId, name) as EnvironmentRow | undefined;

    return row ? toEnvironment(row) : undefined;
  }
}
