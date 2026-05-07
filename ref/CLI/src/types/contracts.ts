import type { Environment, ScopeTaggedVariable, VersionSourceType } from './domain.js';

export type ShellFamily = 'bash' | 'fish' | 'unknown';

export interface OrgmenvConfig {
  dbPath: string;
  useEncryption: boolean;
  keyPath?: string;
}

export interface ResolvedProject {
  id: string;
  name: string;
  alias: string | null;
}

export interface CommandContext {
  cwd: string;
  nonInteractive: boolean;
  shell: ShellFamily;
  config: OrgmenvConfig;
  project?: ResolvedProject;
  environment?: Environment;
}

export interface ProjectRef {
  id?: string;
  nameOrAlias?: string;
}

export interface ResolveProjectInput {
  explicit?: ProjectRef;
  cwd: string;
  gitRemote?: string;
  repoName?: string;
  folderName?: string;
  nonInteractive: boolean;
}

export interface Candidate {
  projectId: string;
  reason: string;
  confidence: number;
}

export type ResolveProjectResult =
  | { ok: true; projectId: string; confidence: number; reason: string }
  | {
      ok: false;
      error: 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_EXPLICIT';
      candidates?: Candidate[];
    };

export interface VariableMutationInput {
  projectId: string;
  environment: string;
  operation: 'set' | 'unset' | 'import';
  mergeMode?: 'merge' | 'replace';
  key?: string;
  value?: string;
  sourceNote?: string;
  sourceType?: VersionSourceType;
  importEntries?: Array<{ key: string; value: string }>;
}

export interface SnapshotVersion {
  projectId: string;
  environmentId: string;
  versionNumber: number;
  createdAt: string;
  sourceType: VersionSourceType;
}

export interface GlobalVariableInput {
  alias: string;
  key: string;
  value: string;
  encrypted?: boolean;
  isSecret?: boolean;
}

export interface SearchResult {
  query: string;
  values: ScopeTaggedVariable[];
}

export type GenMode = 'stdout' | 'file' | 'shell-export' | 'single-key';

export interface GenerateEnvInput {
  projectId: string;
  environment: string;
  mode: GenMode;
  outputPath?: string;
  key?: string;
  encryptedOutput?: boolean;
}
