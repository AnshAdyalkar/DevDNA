/**
 * HTTP-only auth cookies (requirement §9).
 *
 * Tokens never touch frontend JavaScript. Configuration:
 *  - development: secure=false because http://localhost cannot set secure cookies
 *  - production:  secure=true (HTTPS-only), sameSite per env (lax default)
 */
import type { Response } from 'express';

import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'devdna_access';
export const REFRESH_COOKIE = 'devdna_refresh';

const baseCookie = {
  httpOnly: true as const,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: '/'
};

/** TTLs in ms — kept slightly above the JWT lifetimes. */
function ttlMs(jwtTtl: string): number {
  const match = /^(\d+)([smhd])$/.exec(jwtTtl);
  if (!match) return 15 * 60_000;
  const value = Number(match[1]);
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (units[match[2] ?? ''] ?? 60_000);
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie,
    maxAge: ttlMs(env.JWT_ACCESS_TTL)
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie,
    maxAge: ttlMs(env.JWT_REFRESH_TTL)
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, baseCookie);
}
