/** Shared auth helpers for integration tests. */
import request from 'supertest';

import { app } from './app.js';

/** supertest's `set-cookie` header type is `string | string[] | undefined`; normalize it. */
export function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) throw new Error('Expected Set-Cookie headers on auth response');
  return Array.isArray(raw) ? raw : [raw];
}

/** Register + login a fresh user; returns the auth cookie jar. */
export async function registerAndLogin(
  testApp: typeof app,
  email: string,
  password = 'SecurePass123'
): Promise<{ cookie: string[]; email: string; password: string }> {
  await request(testApp)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      username: email.split('@')[0]!,
      email,
      password
    });
  const login = await request(testApp)
    .post('/api/auth/login')
    .send({ email, password });
  if (login.status !== 200) {
    throw new Error(`Login failed for ${email}: ${login.status}`);
  }
  return { cookie: cookiesOf(login), email, password };
}
