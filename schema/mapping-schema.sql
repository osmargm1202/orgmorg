-- Canonical import mapping SQLite schema.
-- This file defines the structure for the repo-owned mapping artifact
-- that maps source proyecto names to cliente base names.
--
-- The mapping SQLite lives at schema/import-mapping.sqlite in the repo.
-- It is the single source of truth for import resolution.

CREATE TABLE IF NOT EXISTS mapping_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_project_name TEXT NOT NULL UNIQUE,
  cliente_base_name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mapping_entries_source
  ON mapping_entries (source_project_name);
