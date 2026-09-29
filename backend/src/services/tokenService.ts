/**
 * Token service — JWT minting/verification for the two-token architecture.
 *
 * Payloads carry the minimum: subject + token type + session id.
 * Refresh tokens are random opaque JWTs (jti) whose session state lives in
 * MongoDB (AuthSession), enabling rotation and revocation.
 */
import crypto from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
  sid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  sid: string;
  jti: string;
}

export function signAccessToken(userId: string, sessionId: string): string {
  const payload: AccessTokenPayload = { sub: userId, type: 'access', sid: sessionId };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL
  } as SignOptions);
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    type: 'refresh',
    sid: sessionId,
    jti: crypto.randomBytes(24).toString('hex')
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const payload = decoded as AccessTokenPayload;
    if (payload.type !== 'access' || !payload.sub) {
      throw unauthorized('Invalid token type');
    }
    return payload;
  } catch {
    throw unauthorized('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    const payload = decoded as RefreshTokenPayload;
    if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
      throw unauthorized('Invalid token type');
    }
    return payload;
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
}

/** SHA-256 hex digest used to store refresh tokens without keeping the raw value. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
