import type Database from 'better-sqlite3';
import type { GlobalVariableRepo } from '../db/repositories/globalVariableRepo.js';
import type { GlobalVariableInput, SearchResult } from '../types/contracts.js';
import type { ScopeTaggedVariable } from '../types/domain.js';
import { EncryptionService } from './encryption.js';

interface ProjectScopedRow {
  project_id: string;
  project_alias: string | null;
  environment_name: string;
  key: string;
  value: string;
}

function buildPreview(value: string): string {
  if (value.length <= 4) {
    return '****';
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export class GlobalVariableService {
  constructor(
    private readonly db: Database.Database,
    private readonly globalVariableRepo: GlobalVariableRepo,
    private readonly encryption: EncryptionService
  ) {}

  upsert(input: GlobalVariableInput): { id: string; alias: string; key: string } {
    const alias = input.alias.trim();
    if (!alias) {
      throw new Error('alias is required for global variables');
    }

    const encrypted = this.encryption.encryptForStorage(input.value);
    const stored = this.globalVariableRepo.upsert({
      alias,
      key: input.key,
      value: encrypted.value,
      encrypted: encrypted.encrypted,
      isSecret: input.isSecret
    });

    return {
      id: stored.id,
      alias: stored.alias,
      key: stored.key
    };
  }

  search(query: string): SearchResult {
    const normalized = query.trim();
    if (!normalized) {
      return { query, values: [] };
    }

    const globalValues: ScopeTaggedVariable[] = this.globalVariableRepo.search(normalized).map((entry) => {
      const value = this.encryption.decryptForUse(entry.value);
      return {
        scope: 'global',
        alias: entry.alias,
        projectId: null,
        environment: null,
        key: entry.key,
        valuePreview: buildPreview(value),
        value
      };
    });

    const like = `%${normalized}%`;
    const projectRows = this.db
      .prepare(
        `
        WITH latest_versions AS (
          SELECT environment_id, MAX(version_number) AS latest_version
          FROM env_versions
          GROUP BY environment_id
        )
        SELECT
          v.project_id,
          p.alias AS project_alias,
          e.name AS environment_name,
          vars.key,
          vars.value
        FROM latest_versions lv
        INNER JOIN env_versions v
          ON v.environment_id = lv.environment_id
         AND v.version_number = lv.latest_version
        INNER JOIN env_variables vars ON vars.env_version_id = v.id
        INNER JOIN environments e ON e.id = v.environment_id
        INNER JOIN projects p ON p.id = v.project_id
        WHERE vars.key LIKE ?
           OR p.name LIKE ?
           OR COALESCE(p.alias, '') LIKE ?
           OR e.name LIKE ?
        ORDER BY p.name ASC, e.name ASC, vars.key ASC
      `
      )
      .all(like, like, like, like) as ProjectScopedRow[];

    const projectValues: ScopeTaggedVariable[] = projectRows.map((row) => {
      const value = this.encryption.decryptForUse(row.value);
      return {
        scope: 'project',
        alias: row.project_alias,
        projectId: row.project_id,
        environment: row.environment_name,
        key: row.key,
        valuePreview: buildPreview(value),
        value
      };
    });

    return {
      query,
      values: [...projectValues, ...globalValues]
    };
  }
}
