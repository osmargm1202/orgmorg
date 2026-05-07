import type Database from 'better-sqlite3';
import { MIGRATIONS, SCHEMA_MIGRATIONS_TABLE_SQL } from './schema.js';

interface MigrationRow {
  name: string;
}

export function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA_MIGRATIONS_TABLE_SQL);

  const appliedRows = db.prepare('SELECT name FROM schema_migrations').all() as MigrationRow[];
  const applied = new Set(appliedRows.map((row) => row.name));

  const markAsApplied = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );

  const apply = db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) {
        continue;
      }

      db.exec(migration.sql);
      markAsApplied.run(migration.name, new Date().toISOString());
    }
  });

  apply();
}
