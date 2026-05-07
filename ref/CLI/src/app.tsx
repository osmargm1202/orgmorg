import React from 'react';
import { render } from 'ink';
import { closeRuntime, createRuntime, type GlobalCliOptions, type RuntimeServices } from './commands/runtime.js';
import { InteractiveMenu } from './interactive/menu.js';

const appVersion = process.env.npm_package_version ?? '1.1.0';

interface AppProps {
  runtime: RuntimeServices;
  options: GlobalCliOptions;
}

function App({ runtime, options }: AppProps): React.JSX.Element {
  return <InteractiveMenu runtime={runtime} options={options} appVersion={appVersion} />;
}

export async function launchInteractiveApp(options: GlobalCliOptions): Promise<void> {
  const runtime = createRuntime(options, { createDbIfMissing: false });

  try {
    const ink = render(<App runtime={runtime} options={options} />, {
      exitOnCtrlC: false
    });

    await ink.waitUntilExit();
  } finally {
    closeRuntime(runtime);
  }
}
