import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import type { Command } from 'commander';
import { createConnection } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { EnvironmentRepo } from '../db/repositories/environmentRepo.js';
import { GlobalVariableRepo } from '../db/repositories/globalVariableRepo.js';
import { ImportedArtifactRepo } from '../db/repositories/importedArtifactRepo.js';
import { ProjectRepo } from '../db/repositories/projectRepo.js';
import { VariableRepo } from '../db/repositories/variableRepo.js';
import { VersionRepo } from '../db/repositories/versionRepo.js';
import { detectShellFamily } from '../utils/terminal.js';
import { getGitSignals } from '../utils/git.js';
import type { Candidate, CommandContext, OrgmenvConfig } from '../types/contracts.js';
import { resolveOrgmenvPaths } from '../utils/paths.js';
import { EncryptionService } from '../services/encryption.js';
import { EnvGeneratorService } from '../services/envGenerator.js';
import { GlobalVariableService } from '../services/globalVariableService.js';
import { ImportedArtifactService } from '../services/importedArtifactService.js';
import { ProjectResolverService } from '../services/projectResolver.js';
import { ToolingDiagnosticsService } from '../services/toolingDiagnostics.js';
import { VariableService } from '../services/variableService.js';
import { VersioningService } from '../services/versioning.js';
import { MIGRATIONS } from '../db/schema.js';

export interface GlobalCliOptions {
  project?: string;
  env?: string;
  noconfirm?: boolean;
  dbPath?: string;
  keyPath?: string;
  encryption?: boolean;
}

export interface RuntimeServices {
  db: Database.Database;
  config: OrgmenvConfig;
  dbState: DbRuntimeState;
  projectRepo: ProjectRepo;
  environmentRepo: EnvironmentRepo;
  versionRepo: VersionRepo;
  variableRepo: VariableRepo;
  globalVariableRepo: GlobalVariableRepo;
  importedArtifactRepo: ImportedArtifactRepo;
  resolver: ProjectResolverService;
  versioning: VersioningService;
  encryption: EncryptionService;
  diagnostics: ToolingDiagnosticsService;
  variableService: VariableService;
  envGenerator: EnvGeneratorService;
  globalVariableService: GlobalVariableService;
  importedArtifactService: ImportedArtifactService;
  initDb: () => DbRuntimeState;
  refreshDbState: () => DbRuntimeState;
}

export interface DbRuntimeState {
  path: string;
  exists: boolean;
  initialized: boolean;
  usingFallbackConnection: boolean;
}

export interface CreateRuntimeOptions {
  createDbIfMissing?: boolean;
}

export function getGlobalOptions(command: Command): GlobalCliOptions {
  const opts = command.optsWithGlobals<GlobalCliOptions>();
  return {
    project: opts.project,
    env: opts.env,
    noconfirm: opts.noconfirm,
    dbPath: opts.dbPath,
    keyPath: opts.keyPath,
    encryption: opts.encryption
  };
}

function isInMemoryDbPath(dbPath: string): boolean {
  return dbPath.trim() === ':memory:';
}

function dbFileExists(dbPath: string): boolean {
  if (isInMemoryDbPath(dbPath)) {
    return true;
  }

  return fs.existsSync(dbPath);
}

function isDbInitialized(db: Database.Database): boolean {
  const schemaMigrationsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations' LIMIT 1")
    .get() as { name: string } | undefined;

  if (!schemaMigrationsTable) {
    return false;
  }

  const row = db
    .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
    .get() as { count: number };

  return row.count >= MIGRATIONS.length;
}

function createRuntimeBindings(db: Database.Database, config: OrgmenvConfig) {
  const projectRepo = new ProjectRepo(db);
  const environmentRepo = new EnvironmentRepo(db);
  const versionRepo = new VersionRepo(db);
  const variableRepo = new VariableRepo(db);
  const globalVariableRepo = new GlobalVariableRepo(db);
  const importedArtifactRepo = new ImportedArtifactRepo(db);

  const resolver = new ProjectResolverService(projectRepo);
  const versioning = new VersioningService(environmentRepo, versionRepo, variableRepo);
  const encryption = new EncryptionService(config);
  const diagnostics = new ToolingDiagnosticsService();
  const variableService = new VariableService(versioning, encryption);
  const envGenerator = new EnvGeneratorService(environmentRepo, variableRepo, encryption);
  const globalVariableService = new GlobalVariableService(db, globalVariableRepo, encryption);
  const importedArtifactService = new ImportedArtifactService(environmentRepo, importedArtifactRepo, encryption);

  return {
    projectRepo,
    environmentRepo,
    versionRepo,
    variableRepo,
    globalVariableRepo,
    importedArtifactRepo,
    resolver,
    versioning,
    encryption,
    diagnostics,
    variableService,
    envGenerator,
    globalVariableService,
    importedArtifactService
  };
}

function assignBindings(runtime: RuntimeServices, bindings: ReturnType<typeof createRuntimeBindings>): void {
  runtime.projectRepo = bindings.projectRepo;
  runtime.environmentRepo = bindings.environmentRepo;
  runtime.versionRepo = bindings.versionRepo;
  runtime.variableRepo = bindings.variableRepo;
  runtime.globalVariableRepo = bindings.globalVariableRepo;
  runtime.importedArtifactRepo = bindings.importedArtifactRepo;
  runtime.resolver = bindings.resolver;
  runtime.versioning = bindings.versioning;
  runtime.encryption = bindings.encryption;
  runtime.diagnostics = bindings.diagnostics;
  runtime.variableService = bindings.variableService;
  runtime.envGenerator = bindings.envGenerator;
  runtime.globalVariableService = bindings.globalVariableService;
  runtime.importedArtifactService = bindings.importedArtifactService;
}

export function createRuntime(options: GlobalCliOptions, runtimeOptions: CreateRuntimeOptions = {}): RuntimeServices {
  const defaultPaths = resolveOrgmenvPaths();
  const createDbIfMissing = runtimeOptions.createDbIfMissing !== false;
  const config: OrgmenvConfig = {
    dbPath: options.dbPath?.trim() || defaultPaths.dbPath,
    useEncryption: options.encryption !== false,
    keyPath: options.keyPath?.trim() || undefined
  };

  const existsAtEffectivePath = dbFileExists(config.dbPath);
  const usingFallbackConnection = !createDbIfMissing && !existsAtEffectivePath && !isInMemoryDbPath(config.dbPath);

  const db = createConnection({ dbPath: usingFallbackConnection ? ':memory:' : config.dbPath });

  if (!usingFallbackConnection) {
    runMigrations(db);
  }

  let runtime!: RuntimeServices;

  runtime = {
    db,
    config,
    dbState: {
      path: config.dbPath,
      exists: usingFallbackConnection ? false : dbFileExists(config.dbPath),
      initialized: usingFallbackConnection ? false : isDbInitialized(db),
      usingFallbackConnection
    },
    ...createRuntimeBindings(db, config),
    initDb: () => {
      if (!runtime.dbState.usingFallbackConnection && runtime.dbState.initialized) {
        return runtime.dbState;
      }

      if (runtime.dbState.usingFallbackConnection) {
        const nextDb = createConnection({ dbPath: runtime.config.dbPath });
        runMigrations(nextDb);
        runtime.db.close();
        runtime.db = nextDb;
        assignBindings(runtime, createRuntimeBindings(nextDb, runtime.config));
      } else {
        runMigrations(runtime.db);
      }

      runtime.refreshDbState();
      return runtime.dbState;
    },
    refreshDbState: () => {
      const initialized = runtime.dbState.usingFallbackConnection ? false : isDbInitialized(runtime.db);
      const exists = runtime.dbState.usingFallbackConnection ? false : dbFileExists(runtime.config.dbPath);

      runtime.dbState = {
        path: runtime.config.dbPath,
        exists,
        initialized,
        usingFallbackConnection: runtime.dbState.usingFallbackConnection && !(exists && initialized)
      };

      return runtime.dbState;
    }
  };

  return runtime;
}

function tryResolveExplicit(value: string, services: RuntimeServices, cwd: string, nonInteractive: boolean) {
  const idAttempt = services.resolver.resolve({
    explicit: { id: value },
    cwd,
    nonInteractive,
    ...getGitSignals(cwd)
  });

  if (idAttempt.ok) {
    return idAttempt;
  }

  return services.resolver.resolve({
    explicit: { nameOrAlias: value },
    cwd,
    nonInteractive,
    ...getGitSignals(cwd)
  });
}

async function handleAmbiguous(
  candidatesInput: Candidate[] | undefined,
  nonInteractive: boolean
): Promise<string> {
  const candidates = candidatesInput ?? [];
  if (candidates.length === 0) {
    throw new Error('project resolution ambiguous and no candidates were provided');
  }

  if (nonInteractive) {
    throw new Error(
      `project resolution is ambiguous: ${candidates.map((c) => `${c.projectId}(${c.confidence})`).join(', ')}`
    );
  }

  console.error('Ambiguous project resolution. Top candidates:');
  candidates.forEach((candidate, index) => {
    console.error(`${index + 1}. ${candidate.projectId} | confidence=${candidate.confidence} | ${candidate.reason}`);
  });

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'project resolution is ambiguous in a non-interactive terminal. Use --project or --noconfirm for deterministic failure.'
    );
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (true) {
      const answer = (await rl.question(`Select project [1-${candidates.length}] or 'q' to cancel: `)).trim();

      if (answer.toLowerCase() === 'q') {
        throw new Error('project selection canceled by user');
      }

      const selected = Number.parseInt(answer, 10);
      if (Number.isInteger(selected) && selected >= 1 && selected <= candidates.length) {
        return candidates[selected - 1].projectId;
      }

      console.error(`invalid selection: "${answer}". Enter a number between 1 and ${candidates.length}.`);
    }
  } finally {
    rl.close();
  }
}

export async function resolveProjectId(
  services: RuntimeServices,
  options: GlobalCliOptions,
  required: boolean
): Promise<string | undefined> {
  const cwd = process.cwd();
  const nonInteractive = options.noconfirm === true;

  const resolved = options.project?.trim()
    ? tryResolveExplicit(options.project.trim(), services, cwd, nonInteractive)
    : services.resolver.resolve({
        cwd,
        nonInteractive,
        ...getGitSignals(cwd)
      });

  if (resolved.ok) {
    return resolved.projectId;
  }

  if (resolved.error === 'AMBIGUOUS') {
    return handleAmbiguous(resolved.candidates, nonInteractive);
  }

  if (required) {
    if (resolved.error === 'INVALID_EXPLICIT') {
      throw new Error('project not found for explicit --project value');
    }
    throw new Error('project not found. Use --project or run init to register one.');
  }

  return undefined;
}

export async function buildCommandContext(
  services: RuntimeServices,
  options: GlobalCliOptions,
  requireProject: boolean
): Promise<CommandContext> {
  const projectId = await resolveProjectId(services, options, requireProject);
  const project = projectId ? services.projectRepo.getById(projectId) : undefined;

  if (project && options.env) {
    services.environmentRepo.ensure(project.id, options.env);
  }

  return {
    cwd: process.cwd(),
    nonInteractive: options.noconfirm === true,
    shell: detectShellFamily(),
    config: services.config,
    project: project
      ? {
          id: project.id,
          name: project.name,
          alias: project.alias
        }
      : undefined,
    environment: project && options.env ? services.environmentRepo.getByName(project.id, options.env) : undefined
  };
}

export function closeRuntime(services: RuntimeServices): void {
  services.db.close();
}

export function printRows(rows: Array<Record<string, string | number | boolean | null>>): void {
  if (rows.length === 0) {
    console.log('(empty)');
    return;
  }

  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[header] ?? '').length)
    )
  );

  const format = (values: string[]) => values.map((v, i) => v.padEnd(widths[i])).join('  ');
  console.log(format(headers));
  console.log(format(widths.map((w) => '-'.repeat(w))));
  rows.forEach((row) => {
    console.log(format(headers.map((header) => String(row[header] ?? ''))));
  });
}
