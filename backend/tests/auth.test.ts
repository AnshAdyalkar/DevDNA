/**
 * End-to-end backend tests for Phase 2 authentication (requirement §39, §41).
 * Runs against a real MongoDB (devdna_test) — each suite starts from a clean
 * users/sessions/audit state so tests are deterministic.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { jest } from '@jest/globals';

import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AuthSession } from '../src/models/AuthSession.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { User } from '../src/models/User.js';
import { createApp } from '../src/app.js';
import { hashToken, signRefreshToken } from '../src/services/tokenService.js';

const app = createApp();

const TEST_USER = {
  name: 'Test Developer',
  username: 'testdev',
  email: 'TestDev@Example.com', // deliberately mixed case — must be normalized
  password: 'SecurePass123'
};

async function clearDb(): Promise<void> {
  await Promise.all([
    User.deleteMany({}),
    AuthSession.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
}

beforeAll(async () => {
  await connectDatabase();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await clearDb();
  await disconnectDatabase();
});

/** Register + login, returning the agent with auth cookies attached. */
async function createAgent(overrides: Partial<typeof TEST_USER> = {}) {
  const payload = { ...TEST_USER, ...overrides };
  await request(app).post('/api/auth/register').send(payload);
  const loginRes = await request(app).post('/api/auth/login').send({
    email: payload.email,
    password: payload.password
  });
  return { agent: request.agent(app), loginRes, payload };
}

/** supertest's `set-cookie` header type is `string | string[] | undefined`; normalize it. */
function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) throw new Error('Expected Set-Cookie headers on auth response');
  return Array.isArray(raw) ? raw : [raw];
}

// ─── Registration ────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('registers a valid account, normalizes email, never returns secrets', async () => {
    const res = await request(app).post('/api/auth/register').send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({
      name: 'Test Developer',
      username: 'testdev',
      email: 'testdev@example.com' // lowercased
    });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password');
    expect(body).not.toContain('hash');

    const doc = await User.findOne({ email: 'testdev@example.com' });
    expect(doc?.passwordHash).toBeDefined();
    expect(doc?.passwordHash).not.toBe(TEST_USER.password); // bcrypt-hashed
  });

  it('rejects duplicate email case-insensitively', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'TESTDEV@example.com', username: 'other' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'other@example.com' });

    expect(res.status).toBe(409);
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects weak passwords with a clear message', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, password: 'weak' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error.details)).toContain('at least 8');
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets http-only cookies', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const joined = cookies.join(';');
    expect(joined).toContain('devdna_access');
    expect(joined).toContain('devdna_refresh');
    expect(joined).toContain('HttpOnly');
    expect(joined).not.toContain('Secure'); // dev configuration
  });

  it('rejects wrong password with a generic error', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass999' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('does not reveal whether an email exists', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Whatever123' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects inactive accounts', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    await User.updateOne({ email: 'testdev@example.com' }, { isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(401);
  });
});

// ─── Authentication middleware ───────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns the current user for a valid access token', async () => {
    const { agent, loginRes } = await createAgent();
    void agent;
    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(loginRes));

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('testdev@example.com');
    expect(res.body.data.user.githubConnected).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'devdna_access=garbage.token.value');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an expired access token', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const user = await User.findOne({ email: 'testdev@example.com' });
    void user;

    // Mint a token that expired 1 minute ago by monkey-patching jwt via a
    // short-TTL secret is complex; instead use verify path with a crafted
    // expired token signed with the test secret.
    const jwt = await import('jsonwebtoken');
    const expired = jwt.sign(
      { sub: new mongoose.Types.ObjectId().toString(), type: 'access', sid: 'x' },
      'test-access-secret-at-least-16-chars',
      { expiresIn: '-1m' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `devdna_access=${expired}`);

    expect(res.status).toBe(401);
  });
});

// ─── Refresh & rotation ──────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('rotates a valid refresh token and issues new cookies', async () => {
    const { loginRes } = await createAgent();
    const oldCookies = loginRes.headers['set-cookie'] as unknown as string[];
    const oldRefresh = oldCookies
      .find((c) => c.startsWith('devdna_refresh='))
      ?.split(';')[0]
      ?.split('=')[1];
    expect(oldRefresh).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${oldRefresh}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('testdev@example.com');

    const newCookies = res.headers['set-cookie'] as unknown as string[];
    const newRefresh = newCookies
      .find((c) => c.startsWith('devdna_refresh='))
      ?.split(';')[0]
      ?.split('=')[1];
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(oldRefresh);

    // Old token must now be revoked — reuse triggers full revocation
    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${oldRefresh}`);
    expect(replay.status).toBe(401);
  });

  it('rejects a revoked refresh token and revokes all user sessions on reuse', async () => {
    const { loginRes } = await createAgent();
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const refresh = cookies
      .find((c) => c.startsWith('devdna_refresh='))
      ?.split(';')[0]
      ?.split('=')[1];
    expect(refresh).toBeTruthy();

    // Revoke explicitly server-side
    const payloadVerified = crypto.createHash('sha256').update(refresh ?? '').digest('hex');
    await AuthSession.updateOne({ refreshTokenHash: payloadVerified }, { revokedAt: new Date() });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${refresh}`);
    expect(res.status).toBe(401);

    const sessions = await AuthSession.countDocuments({ revokedAt: { $exists: false } });
    expect(sessions).toBe(0); // reuse detection revoked everything
  });

  it('rejects a garbage refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'devdna_refresh=nonsense');
    expect(res.status).toBe(401);
  });

  it('rejects when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('accepts a freshly minted token pair via the token service', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    const user = await User.findOne({ email: 'testdev@example.com' });
    const userId = String(user?._id);

    const session = await AuthSession.create({
      userId: user?._id,
      refreshTokenHash: 'pending',
      userAgent: 'jest',
      expiresAt: new Date(Date.now() + 60_000)
    });
    const refreshToken = signRefreshToken(userId, String(session._id));
    await AuthSession.updateOne(
      { _id: session._id },
      { refreshTokenHash: hashToken(refreshToken) }
    );

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(userId);
  });
});

// ─── Profile ─────────────────────────────────────────────────────────────────

describe('GET/PATCH /api/users/me', () => {
  it('returns the authenticated profile', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .get('/api/users/me')
      .set('Cookie', cookiesOf(loginRes));

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('testdev');
  });

  it('updates editable profile fields', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookiesOf(loginRes))
      .send({
        bio: 'Full-stack developer in training',
        location: 'Berlin',
        targetRole: 'Full Stack Developer',
        experienceLevel: 'student',
        graduationYear: 2027
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.bio).toBe('Full-stack developer in training');
    expect(res.body.data.user.targetRole).toBe('Full Stack Developer');
  });

  it('rejects updates to protected fields', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookiesOf(loginRes))
      .send({ githubId: 12345, isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated profile access', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('rejects a taken username on update', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);
    await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, username: 'seconduser', email: 'second@example.com' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'second@example.com', password: TEST_USER.password });

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookiesOf(login))
      .send({ username: 'testdev' });

    expect(res.status).toBe(409);
  });
});

// ─── Password change ─────────────────────────────────────────────────────────

describe('PATCH /api/auth/password', () => {
  it('changes password with correct current password and revokes sessions', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Cookie', cookiesOf(loginRes))
      .send({ currentPassword: TEST_USER.password, newPassword: 'NewSecure456' });

    expect(res.status).toBe(200);

    // Old access token must now fail (user exists but sessions were revoked —
    // access tokens remain valid until expiry by design; refresh is dead).
    const sessions = await AuthSession.countDocuments({ revokedAt: { $exists: false } });
    expect(sessions).toBe(0);

    // Old password no longer works
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'NewSecure456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Cookie', cookiesOf(loginRes))
      .send({ currentPassword: 'WrongOld999', newPassword: 'NewSecure456' });

    expect(res.status).toBe(401);
  });

  it('rejects an invalid new password', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Cookie', cookiesOf(loginRes))
      .send({ currentPassword: TEST_USER.password, newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout & logout-all', () => {
  it('revokes the current session and clears cookies', async () => {
    const { loginRes } = await createAgent();
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const refresh = cookies
      .find((c) => c.startsWith('devdna_refresh='))
      ?.split(';')[0]
      ?.split('=')[1];

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);

    const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cleared).toMatch(/devdna_access=;/);

    const session = await AuthSession.findOne({ refreshTokenHash: hashToken(refresh ?? '') });
    expect(session?.revokedAt).toBeDefined();

    // Refresh with the revoked token fails
    const after = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${refresh}`);
    expect(after.status).toBe(401);
  });

  it('logout-all revokes every session', async () => {
    const { loginRes, agent } = await createAgent();
    void agent;
    // Second device
    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Cookie', cookiesOf(loginRes));
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBeGreaterThanOrEqual(2);

    const active = await AuthSession.countDocuments({ revokedAt: { $exists: false } });
    expect(active).toBe(0);

    // Second device's refresh now fails
    const secondCookies = second.headers['set-cookie'] as unknown as string[];
    const secondRefresh = secondCookies
      .find((c) => c.startsWith('devdna_refresh='))
      ?.split(';')[0]
      ?.split('=')[1];
    const after = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `devdna_refresh=${secondRefresh}`);
    expect(after.status).toBe(401);
  });
});

// ─── Forgot / reset password ───────────────────────────────────────────────

describe('POST /api/auth/forgot-password + reset-password', () => {
  it('responds identically for known and unknown emails', async () => {
    await request(app).post('/api/auth/register').send(TEST_USER);

    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: TEST_USER.email });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password with a valid token and revokes old sessions', async () => {
    const { loginRes } = await createAgent();

    // The dev "mail transport" logs the raw token — capture it with a spy.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).post('/api/auth/forgot-password').send({ email: TEST_USER.email });
    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    logSpy.mockRestore();
    const token = /password reset token for \S+: ([0-9a-f]{64})/.exec(logged)?.[1];
    expect(token).toBeTruthy();

    const user = await User.findByEmail(TEST_USER.email);
    expect(user?.passwordResetToken).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewSecurePass123' });
    expect(res.status).toBe(200);

    // Old session must be revoked...
    const meOld = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookiesOf(loginRes));
    // ...once the short access token expires (15m is within jest's patience),
    // so check the refresh session rows instead:
    expect(await AuthSession.countDocuments({ revokedAt: { $exists: true } })).toBeGreaterThan(0);
    void meOld;

    // Old password rejected, new one accepted
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'NewSecurePass123' });
    expect(newLogin.status).toBe(200);

    // Token is single-use
    const replay = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'AnotherPass123' });
    expect(replay.status).toBe(400);
  });

  it('rejects expired or garbage tokens', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), newPassword: 'WhateverPass123' });
    expect(res.status).toBe(400);
  });
});

// ─── Account deletion ────────────────────────────────────────────────────────

describe('DELETE /api/users/me', () => {
  it('requires confirmation', async () => {
    const { loginRes } = await createAgent();
    const res = await request(app)
      .delete('/api/users/me')
      .set('Cookie', cookiesOf(loginRes));

    expect(res.status).toBe(200);
    expect(res.body.data.requiresConfirmation).toBe(true);
    const stillThere = await User.exists({ email: 'testdev@example.com' });
    expect(stillThere).toBeTruthy();
  });

  it('deletes the user, sessions, and nothing else', async () => {
    const { loginRes } = await createAgent();
    await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, username: 'bystander', email: 'bystander@example.com' });

    const res = await request(app)
      .delete('/api/users/me')
      .set('Cookie', cookiesOf(loginRes))
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    expect(await User.exists({ email: 'testdev@example.com' })).toBeNull();
    expect(await User.exists({ email: 'bystander@example.com' })).toBeTruthy();
    expect(await AuthSession.countDocuments()).toBe(0); // cascade removed
  });

  it('rejects unauthenticated deletion', async () => {
    const res = await request(app).delete('/api/users/me').send({ confirm: true });
    expect(res.status).toBe(401);
  });
});

// ─── Security envelope ───────────────────────────────────────────────────────

describe('security behavior', () => {
  it('never leaks passwordHash through any user endpoint', async () => {
    const { loginRes } = await createAgent();
    const me = await request(app).get('/api/auth/me').set('Cookie', cookiesOf(loginRes));
    const users = await request(app)
      .get('/api/users/me')
      .set('Cookie', cookiesOf(loginRes));

    for (const res of [me, users]) {
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('$2');
    }
  });

  it('records audit events without secrets', async () => {
    await createAgent();
    const events = await AuditLog.find().distinct('event');
    expect(events).toContain('USER_REGISTERED');
    expect(events).toContain('USER_LOGIN');
    const logs = JSON.stringify(await AuditLog.find().lean());
    expect(logs).not.toContain(TEST_USER.password);
    expect(logs).not.toContain('$2');
  });
});
