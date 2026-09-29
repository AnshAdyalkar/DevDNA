/**
 * Token encryption at rest (requirement §7).
 *
 * AES-256-GCM with a key derived from GITHUB_TOKEN_ENCRYPTION_KEY via
 * scrypt. Ciphertext format: `v1:<iv>:<authTag>:<ciphertext>` (hex parts).
 * The GitHub access token is ONLY ever persisted in this form and is never
 * returned by any API, log line, or socket payload.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { env } from '../config/env.js';

const VERSION = 'v1';

function key(): Buffer {
  const secret = env.GITHUB_TOKEN_ENCRYPTION_KEY || env.JWT_REFRESH_SECRET;
  // 32-byte key for AES-256; scrypt hardens short/passphrase-style values.
  return scryptSync(secret, 'devdna-github-token', 32);
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(payload: string): string {
  const [version, ivHex, tagHex, dataHex] = payload.split(':');
  if (version !== VERSION || !ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed encrypted token payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
}
