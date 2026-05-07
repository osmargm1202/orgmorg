import type Database from 'better-sqlite3';
import type { EnvVariable } from '../../types/domain.js';

interface EnvVariableRow {
  id: number;
  env_version_id: string;
  key: string;
  value: string;
  is_secret: number;
  sort_order: number;
}

function toEnvVariable(row: EnvVariableRow): EnvVariable {
  return {
    id: row.id,
    envVersionId: row.env_version_id,
    key: row.key,
    value: row.value,
    isSecret: row.is_secret === 1,
    sortOrder: row.sort_order
  };
}

export interface SnapshotEntry {
  key: string;
  value: string;
  isSecret?: boolean;
  sortOrder?: number;
}

export class VariableRepo {
  constructor(private readonly db: Database.Database) {}

  writeSnapshot(versionId: string, entries: SnapshotEntry[]): void {
    const insert = this.db.prepare(
      'INSERT INTO env_variables (env_version_id, key, value, is_secret, sort_order) VALUES (?, ?, ?, ?, ?)'
    );

    const apply = this.db.transaction(() => {
      this.db.prepare('DELETE FROM env_variables WHERE env_version_id = ?').run(versionId);

      entries.forEach((entry, index) => {
        insert.run(
          versionId,
          entry.key,
          entry.value,
          entry.isSecret === false ? 0 : 1,
          entry.sortOrder ?? index
        );
      });
    });

    apply();
  }

  getSnapshot(versionId: string): EnvVariable[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM env_variables WHERE env_version_id = ? ORDER BY sort_order ASC, key ASC'
      )
      .all(versionId) as EnvVariableRow[];

    return rows.map(toEnvVariable);
  }

  getLatestSnapshot(projectId: string, environmentId: string): EnvVariable[] {
    const latest = this.db
      .prepare(
        `
        SELECT id
        FROM env_versions
        WHERE project_id = ? AND environment_id = ?
        ORDER BY version_number DESC
        LIMIT 1
      `
      )
      .get(projectId, environmentId) as { id: string } | undefined;

    if (!latest) {
      return [];
    }

    return this.getSnapshot(latest.id);
  }

  getLatestValueByKey(projectId: string, environmentId: string, key: string): string | undefined {
    const row = this.db
      .prepare(
        `
        SELECT ev.value
        FROM env_variables ev
        INNER JOIN env_versions v ON v.id = ev.env_version_id
        WHERE v.project_id = ?
          AND v.environment_id = ?
          AND ev.key = ?
        ORDER BY v.version_number DESC
        LIMIT 1
      `
      )
      .get(projectId, environmentId, key) as { value: string } | undefined;

    return row?.value;
  }
}
