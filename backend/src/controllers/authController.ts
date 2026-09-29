/** Authentication controllers (endpoints summary §37). */
import type { Request, Response } from 'express';

import {
  listSessions,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeAllSessions,
  toPublicUser
} from '../services/authService.js';
import { changePassword } from '../services/userService.js';
import { asyncHandler, ok } from '../utils/api.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../utils/cookies.js';
import { unauthorized } from '../utils/errors.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  parseBody,
  registerSchema,
  resetPasswordSchema
} from '../validators/authValidator.js';

/** POST /api/auth/register */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBody(registerSchema, req.body);

  const result = await registerUser(input, req);

  setAuthCookies(res, result.accessToken, result.refreshToken);

  ok(
    res,
    { user: result.user },
    'Account created successfully',
    201
  );
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBody(loginSchema, req.body);
  const result = await loginUser(input, req);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  ok(res, { user: result.user }, 'Login successful');
});

/** POST /api/auth/refresh — validates and rotates the refresh token. */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw unauthorized('No refresh token provided');

  const result = await refreshSession(token, req);
  setAuthCookies(res, result.accessToken, result.refreshToken);
  ok(res, { user: result.user }, 'Session refreshed');
});

/** POST /api/auth/logout — revokes the current session, clears cookies. */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  await logoutSession(token, req);
  clearAuthCookies(res);
  ok(res, { loggedOut: true }, 'Logged out');
});

/** POST /api/auth/logout-all — revokes every session for the current user. */
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const revoked = await revokeAllSessions(String(req.user._id), req);
  clearAuthCookies(res);
  ok(res, { revoked }, 'Logged out from all devices');
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  ok(res, { user: toPublicUser(req.user) });
});

/** PATCH /api/auth/password — change password, revoke all sessions. */
export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const input = parseBody(changePasswordSchema, req.body);
  await changePassword(req.user, input.currentPassword, input.newPassword, String(req.user._id));
  clearAuthCookies(res);
  ok(res, { changed: true }, 'Password changed — please sign in again');
});

/** GET /api/auth/sessions — active sessions for the settings UI (§27). */
export const sessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.auth) throw unauthorized('Authentication required');
  const list = await listSessions(String(req.user._id), req.auth.sessionId);
  ok(res, { sessions: list });
});

/** POST /api/auth/forgot-password — always 200; never reveals account existence. */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBody(forgotPasswordSchema, req.body);
  await requestPasswordReset(input.email, req);
  ok(
    res,
    { requested: true },
    'If an account exists for that email, a reset link has been sent'
  );
});

/** POST /api/auth/reset-password — consumes the token, sets the new password. */
export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parseBody(resetPasswordSchema, req.body);
  await resetPassword(input.token, input.newPassword, req);
  ok(res, { reset: true }, 'Password has been reset — you can now sign in');
});
