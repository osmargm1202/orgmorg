export const SCHEMA_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
`;

export const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '0001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        alias TEXT,
        root_path TEXT,
        git_remote TEXT,
        git_repo_name TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        active INTEGER DEFAULT 1 NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_identifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        identifier_type TEXT NOT NULL,
        identifier_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(identifier_type, identifier_value),
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, name),
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS env_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT,
        change_note TEXT,
        source_type TEXT NOT NULL,
        UNIQUE(project_id, environment_id, version_number),
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(environment_id) REFERENCES environments(id)
      );

      CREATE TABLE IF NOT EXISTS env_variables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        env_version_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        is_secret INTEGER DEFAULT 1 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        FOREIGN KEY(env_version_id) REFERENCES env_versions(id)
      );

      CREATE TABLE IF NOT EXISTS global_variables (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        is_secret INTEGER DEFAULT 1 NOT NULL,
        encrypted INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(alias, key),
        CHECK(length(trim(alias)) > 0)
      );

      CREATE TABLE IF NOT EXISTS generation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        generated_path TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(environment_id) REFERENCES environments(id)
      );

      CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
      CREATE INDEX IF NOT EXISTS idx_projects_alias ON projects(alias);
      CREATE INDEX IF NOT EXISTS idx_project_identifiers_project ON project_identifiers(project_id);
      CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);
      CREATE INDEX IF NOT EXISTS idx_env_versions_project_env ON env_versions(project_id, environment_id);
      CREATE INDEX IF NOT EXISTS idx_env_variables_version ON env_variables(env_version_id);
      CREATE INDEX IF NOT EXISTS idx_global_variables_key ON global_variables(key);
    `
  },
  {
    name: '0002_imported_artifacts',
    sql: `
      CREATE TABLE IF NOT EXISTS imported_artifacts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        content TEXT NOT NULL,
        encrypted INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, environment_id, file_name, file_type),
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(environment_id) REFERENCES environments(id)
      );

      CREATE INDEX IF NOT EXISTS idx_imported_artifacts_scope
        ON imported_artifacts(project_id, environment_id, file_type);
    `
  }
];
