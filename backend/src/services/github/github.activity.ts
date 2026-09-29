/**
 * GitHub activity fetchers (Phase 3 §15-§17, §21-§24).
 * All list endpoints are paginated; lean DTOs only — no huge payloads.
 */
import { githubPaginate } from './github.client.js';

// ─── Commits ─────────────────────────────────────────────────────────────────

interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; email?: string; date?: string } | null;
    committer: { name?: string; email?: string; date?: string } | null;
  };
  author: { login?: string; id?: number } | null;
}

export interface NormalizedCommit {
  sha: string;
  authorGithubId?: number | null | undefined;
  authorLogin?: string | null | undefined;
  message: string;
  committedAt: Date;
  authoredAt?: Date | null | undefined;
  htmlUrl: string;
}

/**
 * Commits on the default branch. Since-commit narrowing (incremental sync,
 * §17) uses the `since` parameter where GitHub supports it. Bounded pages so
 * one huge repository cannot exhaust the rate limit.
 */
export function fetchCommits(
  encryptedToken: string,
  fullName: string,
  branch: string,
  opts: { since?: Date | undefined; maxPages?: number } = {}
): Promise<NormalizedCommit[]> {
  let path = `/repos/${fullName}/commits?sha=${encodeURIComponent(branch)}`;
  if (opts.since) path += `&since=${opts.since.toISOString()}`;

  return githubPaginate<GhCommit>(path, {
    token: encryptedToken,
    maxPages: opts.maxPages ?? 4 // 4 × 50 = 200 recent commits per repo per sync
  }).then(({ items }) =>
    items
      .filter((c) => Boolean(c.commit?.committer?.date ?? c.commit?.author?.date))
      .map((c) => ({
        sha: c.sha,
        authorGithubId: c.author?.id,
        authorLogin: c.author?.login,
        message: (c.commit?.message ?? '').split('\n')[0]!.slice(0, 300),
        committedAt: new Date(c.commit.committer?.date ?? c.commit.author?.date ?? Date.now()),
        authoredAt: c.commit.author?.date ? new Date(c.commit.author.date) : undefined,
        htmlUrl: c.html_url
      }))
  );
}

// ─── Issues (true issues — PRs arrive via the PR endpoint) ──────────────────

interface GhIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  /** GitHub includes PRs in issue listings — filtered out here. */
  pull_request?: unknown;
  user: { login?: string } | null;
  labels: { name?: string }[];
  created_at: string;
  closed_at: string | null;
  html_url: string;
}

export interface NormalizedIssue {
  githubId: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  authorLogin?: string | null | undefined;
  labels: string[];
  createdAt: Date;
  closedAt?: Date | null | undefined;
  htmlUrl: string;
}

export function fetchIssues(
  encryptedToken: string,
  fullName: string,
  maxPages = 2
): Promise<NormalizedIssue[]> {
  return githubPaginate<GhIssue>(
    `/repos/${fullName}/issues?state=all&sort=created&direction=desc`,
    { token: encryptedToken, maxPages }
  ).then(({ items }) =>
    items
      .filter((i) => !i.pull_request)
      .map((i) => ({
        githubId: i.id,
        number: i.number,
        title: (i.title ?? '').slice(0, 300),
        state: i.state,
        authorLogin: i.user?.login,
        labels: (i.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
        createdAt: new Date(i.created_at),
        closedAt: i.closed_at ? new Date(i.closed_at) : undefined,
        htmlUrl: i.html_url
      }))
  );
}

// ─── Pull requests ───────────────────────────────────────────────────────────

interface GhPull {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  user: { login?: string; id?: number } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  html_url: string;
}

export interface NormalizedPull {
  githubId: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft: boolean;
  authorLogin?: string | null | undefined;
  authorGithubId?: number | null | undefined;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null | undefined;
  mergedAt?: Date | null | undefined;
  htmlUrl: string;
}

export function fetchPulls(
  encryptedToken: string,
  fullName: string,
  maxPages = 2
): Promise<NormalizedPull[]> {
  return githubPaginate<GhPull>(
    `/repos/${fullName}/pulls?state=all&sort=created&direction=desc`,
    { token: encryptedToken, maxPages }
  ).then(({ items }) =>
    items.map((p) => ({
      githubId: p.id,
      number: p.number,
      title: (p.title ?? '').slice(0, 300),
      state: p.state,
      draft: p.draft ?? false,
      authorLogin: p.user?.login,
      authorGithubId: p.user?.id,
      createdAt: new Date(p.created_at),
      updatedAt: new Date(p.updated_at),
      closedAt: p.closed_at ? new Date(p.closed_at) : undefined,
      mergedAt: p.merged_at ? new Date(p.merged_at) : undefined,
      htmlUrl: p.html_url
    }))
  );
}

// ─── Releases ────────────────────────────────────────────────────────────────

interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

export interface NormalizedRelease {
  githubId: number;
  tagName: string;
  name?: string | null | undefined;
  draft: boolean;
  prerelease: boolean;
  publishedAt?: Date | null | undefined;
  htmlUrl: string;
}

export function fetchReleases(
  encryptedToken: string,
  fullName: string,
  maxPages = 1
): Promise<NormalizedRelease[]> {
  return githubPaginate<GhRelease>(`/repos/${fullName}/releases`, {
    token: encryptedToken,
    maxPages
  }).then(({ items }) =>
    items.map((r) => ({
      githubId: r.id,
      tagName: r.tag_name,
      name: r.name ?? undefined,
      draft: r.draft,
      prerelease: r.prerelease,
      publishedAt: r.published_at ? new Date(r.published_at) : undefined,
      htmlUrl: r.html_url
    }))
  );
}

// ─── Contributors ────────────────────────────────────────────────────────────

interface GhContributor {
  id: number;
  login: string;
  contributions: number;
}

export interface NormalizedContributor {
  githubId: number;
  login: string;
  contributions: number;
}

export function fetchContributors(
  encryptedToken: string,
  fullName: string,
  maxPages = 1
): Promise<NormalizedContributor[]> {
  return githubPaginate<GhContributor>(`/repos/${fullName}/contributors`, {
    token: encryptedToken,
    maxPages
  }).then(({ items }) =>
    items.map((c) => ({ githubId: c.id, login: c.login, contributions: c.contributions }))
  );
}
