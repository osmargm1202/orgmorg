import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Project, ProjectIdentifier, ProjectIdentifierType } from '../../types/domain.js';

interface ProjectRow {
  id: string;
  name: string;
  alias: string | null;
  root_path: string | null;
  git_remote: string | null;
  git_repo_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  active: number;
}

interface ProjectIdentifierRow {
  id: number;
  project_id: string;
  identifier_type: ProjectIdentifierType;
  identifier_value: string;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    rootPath: row.root_path,
    gitRemote: row.git_remote,
    gitRepoName: row.git_repo_name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    active: row.active === 1
  };
}

function toIdentifier(row: ProjectIdentifierRow): ProjectIdentifier {
  return {
    id: row.id,
    projectId: row.project_id,
    identifierType: row.identifier_type,
    identifierValue: row.identifier_value,
    createdAt: row.created_at
  };
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  alias?: string;
  rootPath?: string;
  gitRemote?: string;
  gitRepoName?: string;
  description?: string;
}

export class ProjectRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateProjectInput): Project {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();

    this.db
      .prepare(
        `
        INSERT INTO projects (
          id, name, alias, root_path, git_remote, git_repo_name,
          description, created_at, updated_at, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `
      )
      .run(
        id,
        input.name,
        input.alias ?? null,
        input.rootPath ?? null,
        input.gitRemote ?? null,
        input.gitRepoName ?? null,
        input.description ?? null,
        now,
        now
      );

    const project = this.getById(id);
    if (!project) {
      throw new Error('Failed to create project');
    }

    return project;
  }

  list(): Project[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM projects WHERE active = 1 ORDER BY (last_used_at IS NULL) ASC, last_used_at DESC, name ASC'
      )
      .all() as ProjectRow[];

    return rows.map(toProject);
  }

  getById(projectId: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ? LIMIT 1').get(projectId) as
      | ProjectRow
      | undefined;

    return row ? toProject(row) : undefined;
  }

  getByNameOrAlias(nameOrAlias: string): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects WHERE name = ? OR alias = ? ORDER BY updated_at DESC')
      .all(nameOrAlias, nameOrAlias) as ProjectRow[];

    return rows.map(toProject);
  }

  touchLastUsed(projectId: string): void {
    this.db
      .prepare('UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), projectId);
  }

  addIdentifier(projectId: string, type: ProjectIdentifierType, value: string): ProjectIdentifier {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO project_identifiers (
          project_id, identifier_type, identifier_value, created_at
        ) VALUES (?, ?, ?, ?)
      `
      )
      .run(projectId, type, value, now);

    const row = this.db
      .prepare(
        'SELECT * FROM project_identifiers WHERE identifier_type = ? AND identifier_value = ? LIMIT 1'
      )
      .get(type, value) as ProjectIdentifierRow | undefined;

    if (!row) {
      throw new Error('Failed to persist project identifier');
    }

    return toIdentifier(row);
  }

  setAlias(projectId: string, alias?: string): Project {
    const normalized = alias?.trim();
    const now = new Date().toISOString();

    this.db.prepare('UPDATE projects SET alias = ?, updated_at = ? WHERE id = ?').run(normalized || null, now, projectId);

    this.db
      .prepare("DELETE FROM project_identifiers WHERE project_id = ? AND identifier_type = 'alias'")
      .run(projectId);

    if (normalized) {
      this.addIdentifier(projectId, 'alias', normalized);
    }

    const project = this.getById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return project;
  }

  findByIdentifier(type: ProjectIdentifierType, value: string): Project | undefined {
    const row = this.db
      .prepare(
        `
        SELECT p.*
        FROM project_identifiers pi
        INNER JOIN projects p ON p.id = pi.project_id
        WHERE pi.identifier_type = ? AND pi.identifier_value = ?
        LIMIT 1
      `
      )
      .get(type, value) as ProjectRow | undefined;

    return row ? toProject(row) : undefined;
  }
}
