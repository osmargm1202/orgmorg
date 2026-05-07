/**
 * SQLite schema for orgmorg — applied on bootstrap (first use or explicit init).
 *
 * Tables:
 *   clientes   — persistent entity; required for proyecto and cotización creation.
 *   proyectos  — belongs to a cliente; optionally linked to legacy external id.
 *   cotizaciones — belongs to a proyecto AND a cliente; cliente must match the
 *                  proyecto's cliente (integrity enforced at app layer).
 *   seed_sequences — metadata table tracking source maxima from imports so that
 *                    new IDs/numbers never collide with legacy ranges, without
 *                    inserting visible fake rows into runtime tables.
 *   import_mappings — reproducible mapping from source project names to cliente
 *                     base names, used to deterministically resolve formerly
 *                     unmapped records during import.
 */

export const SQLITE_BOOTSTRAP_SQL = `
-- Foreign keys must be enabled per-connection; handled in db.ts.

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  nombre_comercial TEXT,
  numero TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  id_externo INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cotizacion INTEGER NOT NULL UNIQUE,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_proyecto_id ON cotizaciones (proyecto_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_id ON cotizaciones (cliente_id);
CREATE INDEX IF NOT EXISTS idx_proyectos_cliente_id ON proyectos (cliente_id);

-- Metadata table for seed sequence tracking.
-- Stores the maximum legacy ID/number from source data so that new runtime
-- records never reuse identifiers that exist in source datasets.
-- No fake rows are inserted into proyectos or cotizaciones.
CREATE TABLE IF NOT EXISTS seed_sequences (
  name TEXT PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0
);

-- Reproducible import mapping: maps source proyecto names to cliente base names.
-- Used to deterministically resolve formerly unmapped records.
-- source_project_name: normalized (UPPERCASE) project name from source data.
-- cliente_base_name: the base name to use when creating or matching a cliente.
-- resolved_cliente_id: the cliente ID that was used (set after resolution).
-- was_existing: 1 if the cliente was reused from existing data, 0 if newly created, NULL if pending.
-- status: 'pending' | 'resolved' | 'skipped'
-- created_at / resolved_at: audit timestamps.
CREATE TABLE IF NOT EXISTS import_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_project_name TEXT NOT NULL,
  cliente_base_name TEXT NOT NULL,
  resolved_cliente_id INTEGER REFERENCES clientes(id),
  was_existing INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  UNIQUE(source_project_name)
);

CREATE INDEX IF NOT EXISTS idx_import_mappings_status ON import_mappings (status);
CREATE INDEX IF NOT EXISTS idx_import_mappings_source ON import_mappings (source_project_name);
`
