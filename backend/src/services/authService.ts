/**
 * Authentication service — registration, login, refresh-token rotation
 * with reuse detection, logout, and session listing (requirements §6–§12).
 */
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';

import { AuthSession, type AuthSessionDocument } from '../models/AuthSession.js';
import { User, type UserDocument } from '../models/User.js';
import { audit } from './auditService.js';
import { comparePassword, hashPassword } from './passwordService.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from './tokenService.js';
import { env, isProd } from '../config/env.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import type { PublicUser } from '../../../shared/types.js';

interface RequestMeta {
  req: Request;
}

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    location: user.location,
    college: user.college,
    degree: user.degree,
    graduationYear: user.graduationYear,
    targetRole: user.targetRole,
    experienceLevel: user.experienceLevel,
    githubConnected: user.githubConnected,
    createdAt: (user.createdAt ?? new Date()).toISOString()
  };
}

function requestMeta({ req }: RequestMeta) {
  return {
    userAgent: req.headers['user-agent']?.slice(0, 400) ?? 'unknown',
    ipAddress: req.ip
  };
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/** Create a session row + signed token pair for a user. */
async function issueTokens(user: UserDocument, req: Request): Promise<AuthResult> {
  const meta = requestMeta({ req });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // matches 7d default

  const session = await AuthSession.create({
    userId: user._id,
    refreshTokenHash: 'pending',
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    expiresAt
  });

  const refreshToken = signRefreshToken(String(user._id), String(session._id));
  await AuthSession.updateOne(
    { _id: session._id },
    { refreshTokenHash: hashToken(refreshToken) }
  );

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(String(user._id), String(session._id)),
    refreshToken
  };
}

export async function registerUser(
  input: { name: string; username: string; email: string; password: string },
  req: Request
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim().toLowerCase();

  const [emailTaken, usernameTaken] = await Promise.all([
    User.exists({ email }),
    User.exists({ username })
  ]);

  if (emailTaken) {
    throw conflict('An account with this email already exists');
  }

  if (usernameTaken) {
    throw conflict('This username is already taken');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await User.create({
    name: input.name.trim(),
    username,
    email,
    passwordHash
  });

  audit('USER_REGISTERED', {
    req,
    userId: String(user._id)
  });

  return await issueTokens(user, req);
}

export async function loginUser(
  input: { email: string; password: string },
  req: Request
): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await User.findOne({ email });

  // Generic error whether the account is missing, inactive, or the password
  // is wrong — do not reveal which (requirement §7).
  let authResult: AuthResult | null = null;
  if (user && user.isActive && user.passwordHash) {
    const passwordOk = await comparePassword(input.password, user.passwordHash);
    if (passwordOk) {
      authResult = await issueTokens(user, req);
    }
  }

  if (!authResult || !user) {
    audit('USER_LOGIN_FAILED', { req, userId: user ? String(user._id) : undefined });
    throw unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();
  audit('USER_LOGIN', { req, userId: String(user._id) });
  return authResult;
}

const PASSWORD_RESET_PURPOSE = 'password-reset';

/**
 * Forgot password: issue a single-use, TTL-bounded reset token.
 * Always resolves the same way whether or not the email exists — the response
 * must not reveal account existence (requirement §7 applies here too).
 */
export async function requestPasswordReset(email: string, req: Request): Promise<void> {
  const user = await User.findByEmail(email);
  if (!user || !user.passwordHash) return;

  const token = randomBytes(32).toString('hex');
  user.passwordResetToken = hashToken(`${PASSWORD_RESET_PURPOSE}:${token}`);
  user.passwordResetExpires = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);
  await user.save();

  audit('PASSWORD_RESET_REQUESTED', { req, userId: String(user._id) });

  // Transport boundary: in dev the token is logged server-side so the flow
  // can be exercised end-to-end; production plugs in a mailer and emails it.
  if (!isProd) {
    console.log(`[dev-mail] password reset token for ${user.email}: ${token}`);
  }
}

/** Consume a reset token, set the new password, revoke every session. */
export async function resetPassword(token: string, newPassword: string, req: Request): Promise<void> {
  const user = await User.findOne({
    passwordResetToken: hashToken(`${PASSWORD_RESET_PURPOSE}:${token}`),
    passwordResetExpires: { $gt: new Date() }
  });
  if (!user) throw badRequest('Reset link is invalid or has expired');

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await revokeAllSessions(String(user._id), req);
  audit('PASSWORD_RESET', { req, userId: String(user._id) });
}

/**
 * Rotate a refresh token: validate → verify session → revoke old → issue new.
 * If a revoked token is replayed, kill every session for that user
 * (assumed theft) and refuse.
 */
export async function refreshSession(refreshToken: string, req: Request): Promise<AuthResult> {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const session = await AuthSession.findOne({
    _id: payload.sid,
    userId: payload.sub
  });

  if (!session || session.revokedAt || session.refreshTokenHash !== tokenHash) {
    if (session && session.revokedAt) {
      // Replay of a rotated/revoked token — revoke everything for this user.
      await AuthSession.updateMany(
        { userId: session.userId, revokedAt: { $exists: false } },
        { revokedAt: new Date() }
      );
      audit('SESSION_REUSE_DETECTED', { req, userId: String(session.userId) });
    }
    throw unauthorized('Session is invalid or has been revoked');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    session.revokedAt = new Date();
    await session.save();
    throw unauthorized('Session has expired');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw unauthorized('Account is not active');

  // Rotate: revoke the used token, mint a fresh pair on the same session row.
  session.revokedAt = new Date();
  session.lastUsedAt = new Date();
  await session.save();

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const newSession = await AuthSession.create({
    userId: user._id,
    refreshTokenHash: 'pending',
    userAgent: session.userAgent,
    ipAddress: req.ip,
    expiresAt
  });
  const newRefreshToken = signRefreshToken(String(user._id), String(newSession._id));
  await AuthSession.updateOne(
    { _id: newSession._id },
    { refreshTokenHash: hashToken(newRefreshToken) }
  );

  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(String(user._id), String(newSession._id)),
    refreshToken: newRefreshToken
  };
}

export async function logoutSession(refreshToken: string | undefined, req: Request): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);
    const session = await AuthSession.findOne({ _id: payload.sid, refreshTokenHash: tokenHash });
    if (session && !session.revokedAt) {
      session.revokedAt = new Date();
      await session.save();
      audit('USER_LOGOUT', { req, userId: String(session.userId) });
    }
  } catch {
    // Expired/garbage tokens: logout is still a success from the client's view.
  }
}

export async function revokeAllSessions(userId: string, req: Request): Promise<number> {
  const result = await AuthSession.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
  audit('USER_LOGOUT_ALL', { req, userId, metadata: { revoked: result.modifiedCount } });
  return result.modifiedCount;
}

export interface SessionSummary {
  id: string;
  userAgent: string;
  lastUsedAt: string;
  createdAt: string;
  current?: boolean;
}

export async function listSessions(
  userId: string,
  currentSessionId: string
): Promise<SessionSummary[]> {
  const sessions: AuthSessionDocument[] = await AuthSession.find({
    userId: new mongoose.Types.ObjectId(userId),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  })
    .sort({ lastUsedAt: -1 })
    .limit(20);

  return sessions.map((s) => ({
    id: String(s._id),
    userAgent: s.userAgent,
    lastUsedAt: s.lastUsedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    current: String(s._id) === currentSessionId
  }));
}

/** Validate credentials during a password change. */
export async function verifyCurrentPassword(user: UserDocument, password: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  return comparePassword(password, user.passwordHash);
}

export { toPublicUser };
