import type { GlobalCliOptions, RuntimeServices } from '../commands/runtime.js';
import type { Project } from '../types/domain.js';

export type ScreenId =
  | 'home'
  | 'generate-env'
  | 'current-project'
  | 'variables'
  | 'search'
  | 'history-restore'
  | 'register-project'
  | 'local-config';

export interface ProjectResolutionState {
  project?: Project;
  note?: string;
}

export interface InteractiveScreenProps {
  runtime: RuntimeServices;
  options: GlobalCliOptions;
  environment: string;
  projectState: ProjectResolutionState;
  onBack: () => void;
  onProjectStateChange: () => void;
}
