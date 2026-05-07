import path from 'node:path';
import process from 'node:process';
import type { Command } from 'commander';
import { getGitSignals } from '../utils/git.js';
import { buildCommandContext, closeRuntime, createRuntime, getGlobalOptions } from './runtime.js';

interface InitOptions {
  alias?: string;
  root?: string;
  description?: string;
  gitRemote?: string;
  repoName?: string;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Register current repository as an orgmenv project')
    .argument('[name]', 'project name (defaults to current folder)')
    .option('--alias <alias>', 'project alias')
    .option('--root <path>', 'project root path (defaults to cwd)')
    .option('--description <text>', 'project description')
    .option('--git-remote <remote>', 'git remote URL override')
    .option('--repo-name <name>', 'git repository name override')
    .action(async (name: string | undefined, options: InitOptions, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const runtime = createRuntime(globalOptions);

      try {
        await buildCommandContext(runtime, globalOptions, false);

        const rootPath = path.resolve(options.root?.trim() || process.cwd());
        const fallbackName = path.basename(rootPath);
        const projectName = name?.trim() || fallbackName;

        const gitSignals = getGitSignals(rootPath);
        const gitRemote = options.gitRemote?.trim() || gitSignals.gitRemote;
        const gitRepoName = options.repoName?.trim() || gitSignals.repoName;

        const created = runtime.projectRepo.create({
          name: projectName,
          alias: options.alias?.trim() || undefined,
          rootPath,
          gitRemote,
          gitRepoName,
          description: options.description?.trim() || undefined
        });

        runtime.projectRepo.addIdentifier(created.id, 'root_path', rootPath);
        runtime.projectRepo.addIdentifier(created.id, 'folder_name', path.basename(rootPath));

        if (gitRemote) {
          runtime.projectRepo.addIdentifier(created.id, 'git_remote', gitRemote);
        }

        if (gitRepoName) {
          runtime.projectRepo.addIdentifier(created.id, 'git_repo_name', gitRepoName);
        }

        if (created.alias) {
          runtime.projectRepo.addIdentifier(created.id, 'alias', created.alias);
        }

        const envName = globalOptions.env?.trim() || 'dev';
        runtime.environmentRepo.ensure(created.id, envName);
        console.log(`project registered: ${created.name} (${created.id})`);
      } finally {
        closeRuntime(runtime);
      }
    });
}
