import type { EnvironmentRepo } from '../db/repositories/environmentRepo.js';
import type { SnapshotEntry, VariableRepo } from '../db/repositories/variableRepo.js';
import type { VersionRepo } from '../db/repositories/versionRepo.js';
import type { SnapshotVersion } from '../types/contracts.js';
import type { EnvVariable, VersionSourceType } from '../types/domain.js';

export interface CreateSnapshotInput {
  projectId: string;
  environment: string;
  entries: SnapshotEntry[];
  sourceType: VersionSourceType;
  sourceNote?: string;
  createdBy?: string;
}

export interface RestoreSnapshotInput {
  projectId: string;
  environment: string;
  versionNumber: number;
  sourceNote?: string;
  createdBy?: string;
}

export class VersioningService {
  constructor(
    private readonly environmentRepo: EnvironmentRepo,
    private readonly versionRepo: VersionRepo,
    private readonly variableRepo: VariableRepo
  ) {}

  getLatestSnapshot(projectId: string, environment: string): { version?: SnapshotVersion; entries: EnvVariable[] } {
    const env = this.environmentRepo.getByName(projectId, environment);
    if (!env) {
      return { entries: [] };
    }

    const latest = this.versionRepo.latest(projectId, env.id);
    if (!latest) {
      return { entries: [] };
    }

    return {
      version: {
        projectId: latest.projectId,
        environmentId: latest.environmentId,
        versionNumber: latest.versionNumber,
        createdAt: latest.createdAt,
        sourceType: latest.sourceType
      },
      entries: this.variableRepo.getSnapshot(latest.id)
    };
  }

  createSnapshot(input: CreateSnapshotInput): SnapshotVersion {
    const environment = this.environmentRepo.ensure(input.projectId, input.environment);

    const version = this.versionRepo.create({
      projectId: input.projectId,
      environmentId: environment.id,
      sourceType: input.sourceType,
      changeNote: input.sourceNote,
      createdBy: input.createdBy
    });

    this.variableRepo.writeSnapshot(version.id, input.entries);

    return {
      projectId: version.projectId,
      environmentId: version.environmentId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      sourceType: version.sourceType
    };
  }

  restoreSnapshot(input: RestoreSnapshotInput): SnapshotVersion {
    const environment = this.environmentRepo.getByName(input.projectId, input.environment);
    if (!environment) {
      throw new Error(`environment not found: ${input.environment}`);
    }

    const target = this.versionRepo.getByNumber(input.projectId, environment.id, input.versionNumber);
    if (!target) {
      throw new Error(`version not found: ${input.versionNumber}`);
    }

    const entries = this.variableRepo
      .getSnapshot(target.id)
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
        isSecret: entry.isSecret,
        sortOrder: entry.sortOrder
      }));

    return this.createSnapshot({
      projectId: input.projectId,
      environment: input.environment,
      entries,
      sourceType: 'restore',
      sourceNote: input.sourceNote,
      createdBy: input.createdBy
    });
  }
}
