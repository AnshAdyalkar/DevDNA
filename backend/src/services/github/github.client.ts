/**
 * Centralized GitHub API client (Phase 3 §9, §30, §31).
 * One place for: auth headers, API version, timeouts, retry with exponential
 * backoff (temporary failures only), rate-limit detection, pagination, and
 * normalized errors. Services below never configure HTTP themselves.
 */
import { logger } from '../../utils/logger.js';
import { decryptToken } from '../../utils/crypto.js';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const MAX_PAGES = 20;
const PER_PAGE = 50;

export class GitHubError extends Error {
  readonly status: number;
  readonly code: string;
  /** True when the secondary/request rate limit is exhausted. */
  readonly rateLimited: boolean;
  readonly rateLimitReset?: Date;

  constructor(
    message: string,
    status: number,
    code: string,
    opts: { rateLimited?: boolean; rateLimitReset?: Date | undefined } = {}
  ) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.code = code;
    this.rateLimited = opts.rateLimited ?? false;
    if (opts.rateLimitReset) this.rateLimitReset = opts.rateLimitReset;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
  /** Raw response headers are needed by some callers (e.g. Link parsing). */
  raw?: false;
}

interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  reset: Date | null;
}

function rateInfoFrom(headers: Headers): RateLimitInfo {
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    limit: num(headers.get('x-ratelimit-limit')),
    remaining: num(headers.get('x-ratelimit-remaining')),
    reset: headers.get('x-ratelimit-reset')
      ? new Date(Number(headers.get('x-ratelimit-reset')) * 1000)
      : null
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize any failure into a GitHubError with retryability decided once. */
function normalizeError(status: number, body: string, headers: Headers): GitHubError {
  const info = rateInfoFrom(headers);
  if (status === 403 || status === 429) {
    const limited = info.remaining === 0 || status === 429 || body.includes('rate limit');
    return new GitHubError(
      'GitHub API rate limit reached. Please try synchronization again later.',
      status,
      'GITHUB_RATE_LIMITED',
      { rateLimited: limited, rateLimitReset: info.reset ?? undefined }
    );
  }
  switch (status) {
    case 401:
      return new GitHubError('GitHub token is invalid or expired', 401, 'GITHUB_UNAUTHORIZED');
    case 404:
      return new GitHubError('GitHub resource not found', 404, 'GITHUB_NOT_FOUND');
    case 422:
      return new GitHubError('GitHub rejected the request', 422, 'GITHUB_VALIDATION');
    default:
      return new GitHubError(
        `GitHub API error (${status})`,
        status,
        status >= 500 ? 'GITHUB_TEMPORARY' : 'GITHUB_REQUEST_FAILED'
      );
  }
}

function isRetryable(error: GitHubError): boolean {
  // Never retry auth/permission/validation failures (§31).
  if (error.rateLimited) return false;
  if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 422) {
    return false;
  }
  return error.code === 'GITHUB_TEMPORARY' || error.status === 0;
}

/**
 * Single GitHub API request with auth, timeout, and bounded retries
 * (exponential backoff on temporary failures only).
 */
export async function githubRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; headers: Headers }> {
  const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevDNA'
  };
  if (options.token) headers.Authorization = `Bearer ${decryptToken(options.token)}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let lastError: GitHubError = new GitHubError('Request failed', 0, 'GITHUB_REQUEST_FAILED');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    try {
      const response = await fetch(url, init);

      if (response.ok) {
        const text = await response.text();
        return { data: (text ? JSON.parse(text) : null) as T, headers: response.headers };
      }

      lastError = normalizeError(response.status, await response.text(), response.headers);
    } catch (error) {
      // Network/timeout errors — retryable within budget.
      lastError = new GitHubError(
        error instanceof Error ? error.message : 'Network error calling GitHub',
        0,
        'GITHUB_NETWORK'
      );
    }

    if (attempt < MAX_RETRIES && isRetryable(lastError)) {
      const delay = 500 * 2 ** (attempt - 1); // 500ms, 1s, 2s
      logger.warn('GitHub request failed — retrying', {
        path,
        attempt,
        delayMs: delay,
        code: lastError.code
      });
      await sleep(delay);
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

/**
 * Fetch all pages of a collection endpoint (§16, §51).
 * Follows pagination up to MAX_PAGES to bound API usage; returns normalized
 * items plus the total number of pages consumed.
 */
export async function githubPaginate<T>(
  path: string,
  options: RequestOptions & { maxPages?: number } = {}
): Promise<{ items: T[]; pages: number; truncated: boolean }> {
  const maxPages = options.maxPages ?? MAX_PAGES;
  const items: T[] = [];
  let url: string | null =
    `${path}${path.includes('?') ? '&' : '?'}per_page=${PER_PAGE}&page=1`;

  for (let page = 1; page <= maxPages && url; page++) {
    const { data, headers }: { data: T[]; headers: Headers } = await githubRequest<T[]>(
      url,
      options
    );
    if (Array.isArray(data)) items.push(...data);

    const link: string | null = headers.get('link');
    const next: string | null = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    url = next;
    if (!Array.isArray(data) || data.length === 0) break;
  }

  return { items, pages: Math.min(maxPages, Math.ceil(items.length / PER_PAGE) || 1), truncated: Boolean(url) };
}
