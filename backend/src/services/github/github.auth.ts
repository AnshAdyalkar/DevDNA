/**
 * GitHub OAuth helpers (Phase 3 §3-§5, §41).
 *
 * State/CSRF: a random nonce is stored inside a short-lived, signed,
 * HTTP-only cookie AND carried in the URL. The callback only proceeds when
 * the URL state matches the cookie state — a cross-site attacker cannot read
 * or set our cookies, so forged callbacks fail.
 *
 * Scopes (minimum necessary, documented per §5):
 *  - read:user            → identity + profile (login, name, avatar, followers)
 *  - user:email           → primary email for the profile view
 *  - repo:status          → read commit statuses on repos the user can access
 *  - public_repo          → read public repo data (commits/PRs/issues) for analysis
 * No write/delete scopes are requested. Private-repo analysis is NOT enabled
 * in this phase (public data only); adding `repo` later is a deliberate,
 * user-visible decision.
 */
import { randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';
import { GitHubError, githubRequest } from './github.client.js';

export const GITHUB_SCOPES = ['read:user', 'user:email', 'repo:status', 'public_repo'] as const;

export const OAUTH_STATE_COOKIE = 'devdna_gh_state';

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

/** Build the GitHub authorize URL with a fresh CSRF state. */
export function buildAuthorizeUrl(state: string): string {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new GitHubError('GitHub OAuth is not configured on this server', 503, 'GITHUB_NOT_CONFIGURED');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    scope: GITHUB_SCOPES.join(' '),
    state,
    allow_signup: 'true'
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function callbackUrl(): string {
  return env.GITHUB_CALLBACK_URL || env.GITHUB_REDIRECT_URI;
}

export function newState(): string {
  return randomBytes(24).toString('hex');
}

/** Constant-time-ish comparison — equal length is enforced by hex format. */
export function stateMatches(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface GitHubUserDto {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  html_url: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export function isOAuthConfigured(): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/** Exchange the authorization code for an access token (server-side only). */
export async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GitHubError('GitHub OAuth is not configured on this server', 503, 'GITHUB_NOT_CONFIGURED');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'DevDNA'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl()
    }),
    signal: AbortSignal.timeout(15_000)
  });

  const body = (await response.json().catch(() => null)) as
    | (OAuthTokenResponse & { error?: string; error_description?: string })
    | null;

  if (!response.ok || !body?.access_token) {
    throw new GitHubError(
      body?.error_description ?? 'GitHub rejected the authorization code',
      response.status === 200 ? 400 : response.status,
      'GITHUB_BAD_CODE'
    );
  }
  return { access_token: body.access_token, token_type: body.token_type, scope: body.scope };
}

/** Fetch the authenticated GitHub identity (used right after connection). */
export function fetchGitHubUser(encryptedToken: string): Promise<GitHubUserDto> {
  return githubRequest<GitHubUserDto>('/user', { token: encryptedToken }).then((r) => r.data);
}
