import { execFileSync } from 'node:child_process';

export interface GitSignals {
  gitRemote?: string;
  repoName?: string;
}

function safeGit(args: string[], cwd: string): string | undefined {
  try {
    const output = execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8'
    }).trim();

    return output || undefined;
  } catch {
    return undefined;
  }
}

export function getGitSignals(cwd: string): GitSignals {
  const gitRemote = safeGit(['config', '--get', 'remote.origin.url'], cwd);

  const repoName = gitRemote
    ?.split('/')
    .at(-1)
    ?.replace(/\.git$/, '');

  return { gitRemote, repoName };
}
