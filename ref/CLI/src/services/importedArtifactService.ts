import fs from 'node:fs';
import path from 'node:path';
import type { EnvironmentRepo } from '../db/repositories/environmentRepo.js';
import type { ImportedArtifactRepo } from '../db/repositories/importedArtifactRepo.js';
import type { ArtifactFileType, ImportedArtifact } from '../types/domain.js';
import { EncryptionService } from './encryption.js';

export const SUPPORTED_ARTIFACT_FILE_TYPES: ArtifactFileType[] = ['.env', '.json', '.pem', '.yaml', '.yml'];

export interface ImportedArtifactWithContent extends Omit<ImportedArtifact, 'content'> {
  content: string;
}

export interface ImportArtifactResult {
  artifact: ImportedArtifactWithContent;
  rawContent: string;
}

export interface GeneratedArtifactResult {
  id: string;
  fileName: string;
  fileType: ArtifactFileType;
  outputPath: string;
  content: string;
}

function detectFileType(filePath: string): ArtifactFileType {
  const fileName = path.basename(filePath).toLowerCase();
  if (fileName === '.env') {
    return '.env';
  }

  const extension = path.extname(filePath).toLowerCase();
  if (SUPPORTED_ARTIFACT_FILE_TYPES.includes(extension as ArtifactFileType)) {
    return extension as ArtifactFileType;
  }

  throw new Error(
    `unsupported file type: ${extension || '(none)'}; expected ${SUPPORTED_ARTIFACT_FILE_TYPES.join(', ')}`
  );
}

function toDecrypted(artifact: ImportedArtifact, encryption: EncryptionService): ImportedArtifactWithContent {
  return {
    ...artifact,
    content: encryption.decryptForUse(artifact.content)
  };
}

export class ImportedArtifactService {
  constructor(
    private readonly environmentRepo: EnvironmentRepo,
    private readonly importedArtifactRepo: ImportedArtifactRepo,
    private readonly encryption: EncryptionService
  ) {}

  importFromFile(input: { projectId: string; environment: string; filePath: string }): ImportArtifactResult {
    const environment = this.environmentRepo.ensure(input.projectId, input.environment);
    const resolvedPath = path.resolve(input.filePath.trim());

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`import file not found: ${resolvedPath}`);
    }

    const fileType = detectFileType(resolvedPath);
    const fileName = path.basename(resolvedPath);
    const rawContent = fs.readFileSync(resolvedPath, 'utf8');
    const encrypted = this.encryption.encryptForStorage(rawContent);
    const stored = this.importedArtifactRepo.upsert({
      projectId: input.projectId,
      environmentId: environment.id,
      fileName,
      fileType,
      sourcePath: resolvedPath,
      content: encrypted.value,
      encrypted: encrypted.encrypted
    });

    return {
      artifact: toDecrypted(stored, this.encryption),
      rawContent
    };
  }

  listByProjectEnvironment(input: { projectId: string; environment: string }): ImportedArtifactWithContent[] {
    const environment = this.environmentRepo.getByName(input.projectId, input.environment);
    if (!environment) {
      return [];
    }

    return this.importedArtifactRepo
      .listByProjectEnvironment(input.projectId, environment.id)
      .map((artifact) => toDecrypted(artifact, this.encryption));
  }

  generate(input: {
    projectId: string;
    environment: string;
    artifactIds?: string[];
    generateAll?: boolean;
    mode: 'screen' | 'file';
  }): GeneratedArtifactResult[] {
    const artifacts = this.resolveArtifacts(input);
    if (artifacts.length === 0) {
      return [];
    }

    if (input.mode === 'screen') {
      return artifacts.map((artifact) => ({
        id: artifact.id,
        fileName: artifact.fileName,
        fileType: artifact.fileType,
        outputPath: artifact.sourcePath,
        content: artifact.content
      }));
    }

    return artifacts.map((artifact) => {
      const outputPath = artifact.sourcePath;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, artifact.content, 'utf8');

      return {
        id: artifact.id,
        fileName: artifact.fileName,
        fileType: artifact.fileType,
        outputPath,
        content: artifact.content
      };
    });
  }

  private resolveArtifacts(input: {
    projectId: string;
    environment: string;
    artifactIds?: string[];
    generateAll?: boolean;
    mode: 'screen' | 'file';
  }): ImportedArtifactWithContent[] {
    const environment = this.environmentRepo.getByName(input.projectId, input.environment);
    if (!environment) {
      return [];
    }

    const scoped = this.importedArtifactRepo.listByProjectEnvironment(input.projectId, environment.id);
    if (scoped.length === 0) {
      return [];
    }

    if (input.generateAll) {
      return scoped.map((artifact) => toDecrypted(artifact, this.encryption));
    }

    const requestedIds = (input.artifactIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0);
    if (requestedIds.length === 0) {
      return [];
    }

    const selected = this.importedArtifactRepo
      .getByIds(requestedIds)
      .filter((artifact) => artifact.projectId === input.projectId && artifact.environmentId === environment.id);

    return selected.map((artifact) => toDecrypted(artifact, this.encryption));
  }
}
