import path from 'node:path';
import type { ProjectRepo } from '../db/repositories/projectRepo.js';
import type {
  Candidate,
  ResolveProjectInput,
  ResolveProjectResult
} from '../types/contracts.js';
import type { Project, ProjectIdentifierType } from '../types/domain.js';

const SIGNAL_WEIGHTS: Record<ProjectIdentifierType, number> = {
  root_path: 100,
  git_remote: 90,
  git_repo_name: 75,
  folder_name: 60,
  alias: 40
};

function addCandidate(
  candidateMap: Map<string, Candidate>,
  project: Project,
  reason: string,
  confidence: number
): void {
  const existing = candidateMap.get(project.id);
  if (!existing) {
    candidateMap.set(project.id, {
      projectId: project.id,
      reason,
      confidence
    });
    return;
  }

  candidateMap.set(project.id, {
    projectId: project.id,
    reason: `${existing.reason}; ${reason}`,
    confidence: existing.confidence + confidence
  });
}

function byConfidenceDesc(a: Candidate, b: Candidate): number {
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }

  return a.projectId.localeCompare(b.projectId);
}

export class ProjectResolverService {
  constructor(private readonly projectRepo: ProjectRepo) {}

  resolve(input: ResolveProjectInput): ResolveProjectResult {
    const explicitResult = this.resolveExplicit(input);
    if (explicitResult) {
      return explicitResult;
    }

    return this.resolveBySignals(input);
  }

  private resolveExplicit(input: ResolveProjectInput): ResolveProjectResult | undefined {
    const explicit = input.explicit;
    if (!explicit) {
      return undefined;
    }

    if (explicit.id && explicit.id.trim()) {
      const byId = this.projectRepo.getById(explicit.id);
      if (!byId) {
        return { ok: false, error: 'INVALID_EXPLICIT' };
      }

      return {
        ok: true,
        projectId: byId.id,
        confidence: Number.MAX_SAFE_INTEGER,
        reason: 'explicit:id'
      };
    }

    const nameOrAlias = explicit.nameOrAlias?.trim();
    if (!nameOrAlias) {
      return { ok: false, error: 'INVALID_EXPLICIT' };
    }

    const matches = this.projectRepo.getByNameOrAlias(nameOrAlias);
    if (matches.length === 0) {
      return { ok: false, error: 'INVALID_EXPLICIT' };
    }

    if (matches.length > 1) {
      const candidates: Candidate[] = matches.map((project) => ({
        projectId: project.id,
        confidence: SIGNAL_WEIGHTS.alias,
        reason: 'explicit:name-or-alias'
      }));

      return {
        ok: false,
        error: 'AMBIGUOUS',
        candidates: candidates.sort(byConfidenceDesc)
      };
    }

    return {
      ok: true,
      projectId: matches[0].id,
      confidence: SIGNAL_WEIGHTS.alias,
      reason: 'explicit:name-or-alias'
    };
  }

  private resolveBySignals(input: ResolveProjectInput): ResolveProjectResult {
    const candidateMap = new Map<string, Candidate>();
    const folderName = input.folderName?.trim() || path.basename(input.cwd);

    const signalInputs: Array<{ type: ProjectIdentifierType; value: string | undefined }> = [
      { type: 'root_path', value: input.cwd },
      { type: 'git_remote', value: input.gitRemote },
      { type: 'git_repo_name', value: input.repoName },
      { type: 'folder_name', value: folderName }
    ];

    signalInputs.forEach((signal) => {
      const value = signal.value?.trim();
      if (!value) {
        return;
      }

      const project = this.projectRepo.findByIdentifier(signal.type, value);
      if (!project) {
        return;
      }

      addCandidate(candidateMap, project, `signal:${signal.type}`, SIGNAL_WEIGHTS[signal.type]);
    });

    if (folderName) {
      this.projectRepo.getByNameOrAlias(folderName).forEach((project) => {
        addCandidate(candidateMap, project, 'signal:alias-or-name', SIGNAL_WEIGHTS.alias);
      });
    }

    const ranked = [...candidateMap.values()].sort(byConfidenceDesc);
    if (ranked.length === 0) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    const best = ranked[0];
    const tied = ranked.filter((candidate) => candidate.confidence === best.confidence);
    if (tied.length > 1) {
      return {
        ok: false,
        error: 'AMBIGUOUS',
        candidates: tied.sort(byConfidenceDesc)
      };
    }

    return {
      ok: true,
      projectId: best.projectId,
      confidence: best.confidence,
      reason: best.reason
    };
  }
}
