import { spawnSync } from 'node:child_process';

export interface ToolStatus {
  name: 'age' | 'sops' | 'age-keygen';
  required: boolean;
  available: boolean;
  installGuidance: string[];
}

export interface ToolingDiagnosticsResult {
  allAvailable: boolean;
  tools: ToolStatus[];
}

function isToolAvailable(tool: string): boolean {
  const whichResult = spawnSync('which', [tool], {
    stdio: 'ignore'
  });

  return whichResult.status === 0;
}

function buildInstallGuidance(tool: string): string[] {
  return [
    `Install ${tool} with your package manager:`,
    `- Arch/Manjaro (pacman): sudo pacman -S ${tool}`,
    `- Arch (yay): yay -S ${tool}`,
    `- Arch (paru): paru -S ${tool}`,
    `- Debian/Ubuntu: sudo apt update && sudo apt install -y ${tool}`,
    `- Fedora/RHEL: sudo dnf install -y ${tool}`,
    `- openSUSE: sudo zypper install ${tool}`
  ];
}

export class ToolingDiagnosticsService {
  run(): ToolingDiagnosticsResult {
    const requiredTools = new Set<ToolStatus['name']>(['age', 'age-keygen']);
    const toolNames: ToolStatus['name'][] = ['age', 'sops', 'age-keygen'];
    const tools: ToolStatus[] = toolNames.map((name) => {
      const available = isToolAvailable(name);
      return {
        name,
        required: requiredTools.has(name),
        available,
        installGuidance: available ? [] : buildInstallGuidance(name)
      };
    });

    return {
      allAvailable: tools
        .filter((tool) => tool.required)
        .every((tool) => tool.available),
      tools
    };
  }
}
