import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import type { OrgmenvConfig } from '../types/contracts.js';
import { resolveKeyPath } from '../utils/paths.js';

const AGE_ENCRYPTED_PREFIX = 'age::';
const LEGACY_ENCRYPTED_PREFIX = 'enc::';

function isToolAvailable(tool: string): boolean {
  const whichResult = spawnSync('which', [tool], {
    stdio: 'ignore'
  });

  return whichResult.status === 0;
}

function ensureRequiredTools(): void {
  const required = ['age', 'age-keygen'];
  const missing = required.filter((tool) => !isToolAvailable(tool));

  if (missing.length > 0) {
    throw new Error(
      `missing required encryption tooling: ${missing.join(', ')}. Run \`orgmenv doctor\` for install guidance.`
    );
  }
}

function runCommandOrThrow(command: string, args: string[], input?: string | Buffer): Buffer {
  const result = spawnSync(command, args, {
    input
  });

  if (result.status !== 0) {
    const stderr = (result.stderr ?? Buffer.alloc(0)).toString('utf8').trim();
    const message = stderr || `command exited with status ${result.status ?? 'unknown'}`;
    throw new Error(`${command} failed: ${message}`);
  }

  return result.stdout ?? Buffer.alloc(0);
}

export interface KeySource {
  source: 'env' | 'config';
  path: string;
}

export interface EncryptionResult {
  value: string;
  encrypted: boolean;
  warning?: string;
}

export class EncryptionService {
  constructor(private readonly config: OrgmenvConfig) {}

  resolveKeySource(): KeySource | { source: 'none' } {
    const fromEnv = process.env.AGE_KEY_FILE?.trim();
    if (fromEnv) {
      return { source: 'env', path: fromEnv };
    }

    const fallback = resolveKeyPath(this.config.keyPath);
    if (fallback) {
      return { source: 'config', path: fallback };
    }

    return { source: 'none' };
  }

  shouldEncrypt(): boolean {
    return this.config.useEncryption !== false;
  }

  private resolveEncryptionKeyPathOrThrow(): string {
    const keySource = this.resolveKeySource();
    if (keySource.source === 'none') {
      throw new Error(
        'encryption is enabled but no key source is configured. Set AGE_KEY_FILE or pass --key-path.'
      );
    }

    if (!fs.existsSync(keySource.path)) {
      throw new Error(
        `encryption key file not found: ${keySource.path}. Update AGE_KEY_FILE or --key-path to a valid key file.`
      );
    }

    return keySource.path;
  }

  private resolveRecipientFromKey(keyPath: string): string {
    const recipient = runCommandOrThrow('age-keygen', ['-y', keyPath]).toString('utf8').trim();
    if (!recipient) {
      throw new Error('failed to derive age recipient from key file');
    }

    return recipient;
  }

  encryptForStorage(value: string): EncryptionResult {
    if (!this.shouldEncrypt()) {
      return {
        value,
        encrypted: false,
        warning: 'Encryption disabled via configuration. Secrets will be stored as plaintext.'
      };
    }

    if (this.isEncryptedValue(value)) {
      return { value, encrypted: true };
    }

    ensureRequiredTools();
    const keyPath = this.resolveEncryptionKeyPathOrThrow();
    const recipient = this.resolveRecipientFromKey(keyPath);
    const encryptedPayload = runCommandOrThrow('age', ['--encrypt', '--recipient', recipient], value);

    return {
      value: `${AGE_ENCRYPTED_PREFIX}${encryptedPayload.toString('base64')}`,
      encrypted: true
    };
  }

  decryptForUse(value: string): string {
    if (!value.startsWith(AGE_ENCRYPTED_PREFIX) && !value.startsWith(LEGACY_ENCRYPTED_PREFIX)) {
      return value;
    }

    if (value.startsWith(LEGACY_ENCRYPTED_PREFIX)) {
      const legacyPayload = value.slice(LEGACY_ENCRYPTED_PREFIX.length);
      return Buffer.from(legacyPayload, 'base64').toString('utf8');
    }

    ensureRequiredTools();
    const keyPath = this.resolveEncryptionKeyPathOrThrow();
    const payload = value.slice(AGE_ENCRYPTED_PREFIX.length);
    const encryptedBuffer = Buffer.from(payload, 'base64');
    const decrypted = runCommandOrThrow('age', ['--decrypt', '--identity', keyPath], encryptedBuffer);
    return decrypted.toString('utf8');
  }

  isEncryptedValue(value: string): boolean {
    return value.startsWith(AGE_ENCRYPTED_PREFIX) || value.startsWith(LEGACY_ENCRYPTED_PREFIX);
  }
}
