import type { Command } from 'commander';
import { closeRuntime, createRuntime, getGlobalOptions, resolveProjectId } from './runtime.js';
import { SUPPORTED_ARTIFACT_FILE_TYPES } from '../services/importedArtifactService.js';

interface ImportOptions {
  merge?: boolean;
  replace?: boolean;
  note?: string;
}

export function parseEnvInput(content: string): Array<{ key: string; value: string }> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const split = line.indexOf('=');
      if (split <= 0) {
        throw new Error(`invalid line in import file: ${line}`);
      }
      return {
        key: line.slice(0, split).trim(),
        value: line.slice(split + 1)
      };
    });
}

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description('Import artifact files; .env updates snapshots, all supported types are stored for generation')
    .argument('<file>', `path to file (${SUPPORTED_ARTIFACT_FILE_TYPES.join(', ')})`)
    .option('--merge', 'merge imported keys into current snapshot (default)', true)
    .option('--replace', 'replace snapshot with imported keys')
    .option('--note <text>', 'optional change note')
    .action(async (file: string, options: ImportOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        const projectId = await resolveProjectId(runtime, globalOptions, true);
        const environment = globalOptions.env?.trim() || 'dev';

        const imported = runtime.importedArtifactService.importFromFile({
          projectId: projectId!,
          environment,
          filePath: file
        });

        if (imported.artifact.fileType !== '.env') {
          console.log(
            `stored ${imported.artifact.fileName} (${imported.artifact.fileType}) for ${environment}. Use interactive generate to render/write it.`
          );
          return;
        }

        const mode = options.replace ? 'replace' : 'merge';
        const importEntries = parseEnvInput(imported.rawContent);

        const result = runtime.variableService.mutate({
          projectId: projectId!,
          environment,
          operation: 'import',
          mergeMode: mode,
          importEntries,
          sourceNote: options.note
        });

        console.log(`imported ${importEntries.length} entries into ${environment} (${mode}). version=${result.version.versionNumber}`);
        console.log(`stored artifact ${imported.artifact.fileName} (${imported.artifact.fileType}).`);
        result.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
      } finally {
        closeRuntime(runtime);
      }
    });
}
