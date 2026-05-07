import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ArtifactFileType, ImportedArtifact } from '../../types/domain.js';

interface ImportedArtifactRow {
  id: string;
  project_id: string;
  environment_id: string;
  file_name: string;
  file_type: ArtifactFileType;
  source_path: string;
  content: string;
  encrypted: number;
  created_at: string;
  updated_at: string;
}

function toImportedArtifact(row: ImportedArtifactRow): ImportedArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    fileName: row.file_name,
    fileType: row.file_type,
    sourcePath: row.source_path,
    content: row.content,
    encrypted: row.encrypted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface UpsertImportedArtifactInput {
  projectId: string;
  environmentId: string;
  fileName: string;
  fileType: ArtifactFileType;
  sourcePath: string;
  content: string;
  encrypted: boolean;
}

export class ImportedArtifactRepo {
  constructor(private readonly db: Database.Database) {}

  upsert(input: UpsertImportedArtifactInput): ImportedArtifact {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `
        SELECT id
        FROM imported_artifacts
        WHERE project_id = ?
          AND environment_id = ?
          AND file_name = ?
          AND file_type = ?
        LIMIT 1
      `
      )
      .get(input.projectId, input.environmentId, input.fileName, input.fileType) as
      | { id: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE imported_artifacts
          SET source_path = ?, content = ?, encrypted = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(input.sourcePath, input.content, input.encrypted ? 1 : 0, now, existing.id);

      const row = this.db
        .prepare('SELECT * FROM imported_artifacts WHERE id = ? LIMIT 1')
        .get(existing.id) as ImportedArtifactRow;
      return toImportedArtifact(row);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO imported_artifacts (
          id,
          project_id,
          environment_id,
          file_name,
          file_type,
          source_path,
          content,
          encrypted,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        input.projectId,
        input.environmentId,
        input.fileName,
        input.fileType,
        input.sourcePath,
        input.content,
        input.encrypted ? 1 : 0,
        now,
        now
      );

    const created = this.db
      .prepare('SELECT * FROM imported_artifacts WHERE id = ? LIMIT 1')
      .get(id) as ImportedArtifactRow;
    return toImportedArtifact(created);
  }

  listByProjectEnvironment(projectId: string, environmentId: string): ImportedArtifact[] {
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM imported_artifacts
        WHERE project_id = ? AND environment_id = ?
        ORDER BY updated_at DESC, file_name ASC
      `
      )
      .all(projectId, environmentId) as ImportedArtifactRow[];

    return rows.map(toImportedArtifact);
  }

  getByIds(ids: string[]): ImportedArtifact[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM imported_artifacts WHERE id IN (${placeholders})`)
      .all(...ids) as ImportedArtifactRow[];

    return rows.map(toImportedArtifact);
  }
}
