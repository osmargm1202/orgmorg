import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { EnvVersion, VersionSourceType } from '../../types/domain.js';

interface VersionRow {
  id: string;
  project_id: string;
  environment_id: string;
  version_number: number;
  created_at: string;
  created_by: string | null;
  change_note: string | null;
  source_type: VersionSourceType;
}

function toVersion(row: VersionRow): EnvVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    versionNumber: row.version_number,
    createdAt: row.created_at,
    createdBy: row.created_by,
    changeNote: row.change_note,
    sourceType: row.source_type
  };
}

export interface CreateVersionInput {
  projectId: string;
  environmentId: string;
  sourceType: VersionSourceType;
  createdBy?: string;
  changeNote?: string;
}

export class VersionRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateVersionInput): EnvVersion {
    const now = new Date().toISOString();
    const id = randomUUID();
    const versionNumber = this.nextVersionNumber(input.projectId, input.environmentId);

    this.db
      .prepare(
        `
        INSERT INTO env_versions (
          id, project_id, environment_id, version_number,
          created_at, created_by, change_note, source_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        input.projectId,
        input.environmentId,
        versionNumber,
        now,
        input.createdBy ?? null,
        input.changeNote ?? null,
        input.sourceType
      );

    const version = this.getById(id);
    if (!version) {
      throw new Error('Failed to create env version');
    }

    return version;
  }

  getById(id: string): EnvVersion | undefined {
    const row = this.db.prepare('SELECT * FROM env_versions WHERE id = ? LIMIT 1').get(id) as
      | VersionRow
      | undefined;

    return row ? toVersion(row) : undefined;
  }

  getByNumber(projectId: string, environmentId: string, versionNumber: number): EnvVersion | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM env_versions WHERE project_id = ? AND environment_id = ? AND version_number = ? LIMIT 1'
      )
      .get(projectId, environmentId, versionNumber) as VersionRow | undefined;

    return row ? toVersion(row) : undefined;
  }

  latest(projectId: string, environmentId: string): EnvVersion | undefined {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM env_versions
        WHERE project_id = ? AND environment_id = ?
        ORDER BY version_number DESC
        LIMIT 1
      `
      )
      .get(projectId, environmentId) as VersionRow | undefined;

    return row ? toVersion(row) : undefined;
  }

  history(projectId: string, environmentId: string): EnvVersion[] {
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM env_versions
        WHERE project_id = ? AND environment_id = ?
        ORDER BY version_number DESC
      `
      )
      .all(projectId, environmentId) as VersionRow[];

    return rows.map(toVersion);
  }

  private nextVersionNumber(projectId: string, environmentId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) AS latest FROM env_versions WHERE project_id = ? AND environment_id = ?'
      )
      .get(projectId, environmentId) as { latest: number };

    return row.latest + 1;
  }
}
