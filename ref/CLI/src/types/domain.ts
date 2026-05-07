export type IsoDateTime = string;

export interface Project {
  id: string;
  name: string;
  alias: string | null;
  rootPath: string | null;
  gitRemote: string | null;
  gitRepoName: string | null;
  description: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  lastUsedAt: IsoDateTime | null;
  active: boolean;
}

export type ProjectIdentifierType = 'root_path' | 'folder_name' | 'git_remote' | 'git_repo_name' | 'alias';

export interface ProjectIdentifier {
  id: number;
  projectId: string;
  identifierType: ProjectIdentifierType;
  identifierValue: string;
  createdAt: IsoDateTime;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type VersionSourceType = 'manual' | 'import' | 'update' | 'generate-sync' | 'restore' | 'interactive';

export interface EnvVersion {
  id: string;
  projectId: string;
  environmentId: string;
  versionNumber: number;
  createdAt: IsoDateTime;
  createdBy: string | null;
  changeNote: string | null;
  sourceType: VersionSourceType;
}

export interface EnvVariable {
  id: number;
  envVersionId: string;
  key: string;
  value: string;
  isSecret: boolean;
  sortOrder: number;
}

export interface GlobalVariable {
  id: string;
  alias: string;
  key: string;
  value: string;
  isSecret: boolean;
  encrypted: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ScopeTaggedVariable {
  scope: 'project' | 'global';
  alias: string | null;
  projectId: string | null;
  environment: string | null;
  key: string;
  valuePreview: string;
  value: string;
}

export type ArtifactFileType = '.env' | '.json' | '.pem' | '.yaml' | '.yml';

export interface ImportedArtifact {
  id: string;
  projectId: string;
  environmentId: string;
  fileName: string;
  fileType: ArtifactFileType;
  sourcePath: string;
  content: string;
  encrypted: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
