import readline from 'node:readline/promises';
import process from 'node:process';

export interface ConfirmOptions {
  message: string;
  nonInteractive: boolean;
  defaultValue?: boolean;
}

export async function confirm({
  message,
  nonInteractive,
  defaultValue = false
}: ConfirmOptions): Promise<boolean> {
  if (nonInteractive) {
    return defaultValue;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const suffix = defaultValue ? '[Y/n]' : '[y/N]';
    const response = (await rl.question(`${message} ${suffix} `)).trim().toLowerCase();

    if (!response) {
      return defaultValue;
    }

    return response === 'y' || response === 'yes' || response === 's' || response === 'si';
  } finally {
    rl.close();
  }
}
