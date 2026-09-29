/**
 * requireAuth — verify the JWT access token, load the user, attach to req.
 * Fails closed with 401 and no internals leaked (requirement §14).
 */
import type { NextFunction, Request, Response } from 'express';

import { User } from '../models/User.js';
import { asyncHandler } from '../utils/api.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { unauthorized } from '../utils/errors.js';
import { verifyAccessToken } from '../services/tokenService.js';

export const requireAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw unauthorized('Authentication required');

    const payload = verifyAccessToken(token); // throws 401 on bad/expired

    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw unauthorized('Account is not active');

    req.user = user;
    req.auth = { userId: payload.sub, sessionId: payload.sid, type: 'access' };
    next();
  }
);

/**
 * Like requireAuth but loads the user without rejecting when absent —
 * used by endpoints that behave differently for guests (e.g. landing data).
 */
export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        const user = await User.findById(payload.sub);
        if (user && user.isActive) {
          req.user = user;
          req.auth = { userId: payload.sub, sessionId: payload.sid, type: 'access' };
        }
      } catch {
        // Ignore invalid tokens for optional auth
      }
    }
    next();
  }
);
