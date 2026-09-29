/**
 * GitHub integration controllers (Phase 3 §33).
 * Every data endpoint requires DevDNA auth and scopes every query to
 * req.user._id — cross-user access is impossible by construction (§40).
 */
import type { Request, Response } from 'express';

import { env, allowedOrigins } from '../config/env.js';
import { GitHubAccount } from '../models/GitHubAccount.js';
import { GitHubSyncJob } from '../models/GitHubSyncJob.js';
import { Repository } from '../models/Repository.js';
import { Commit } from '../models/Commit.js';
import { Issue } from '../models/Issue.js';
import { PullRequest } from '../models/PullRequest.js';
import { Release } from '../models/Release.js';
import { Contributor } from '../models/Contributor.js';
import { Branch } from '../models/Branch.js';
import { asyncHandler, ok } from '../utils/api.js';
import { notFound, serviceUnavailable, unauthorized } from '../utils/errors.js';
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl, isOAuthConfigured, newState, stateMatches } from '../services/github/github.auth.js';
import { connectGitHub, disconnectGitHub } from '../services/github/github.connection.js';
import { runSyncJob, startSync } from '../services/github/github.sync.js';

function frontendOrigin(): string {
  return allowedOrigins[0] ?? 'http://localhost:5173';
}

function wantsRedirect(req: Request): boolean {
  return req.query.redirect === '1';
}

function redirectErr(res: Response, code: string): void {
  res.redirect(`${frontendOrigin()}/github?error=${encodeURIComponent(code)}`);
}

/** Load the caller's GitHub account or throw a clean 404-style error. */
async function requireAccount(userId: string) {
  const account = await GitHubAccount.findOne({
    userId: new (await import('mongoose')).Types.ObjectId(userId)
  });
  if (!account) {
    throw notFound('GitHub is not connected for this account');
  }
  return account;
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

/**
 * GET /api/github/connect — starts the OAuth flow.
 * Returns JSON { authorizeUrl, state } by default (useful for tests and SPA
 * popups) or 302s straight to GitHub with ?redirect=1. A one-time CSRF state
 * is stored in a short-lived HTTP-only cookie and mirrored in the URL (§4).
 */
export const connect = asyncHandler(async (req: Request, res: Response) => {
  if (!isOAuthConfigured()) {
    throw serviceUnavailable(
      'GitHub OAuth is not configured on this server (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET missing)'
    );
  }
  if (!req.user) throw unauthorized('Authentication required');

  const state = newState();
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/github',
    maxAge: 10 * 60_000
  });

  const authorizeUrl = buildAuthorizeUrl(state);
  if (wantsRedirect(req)) {
    res.redirect(authorizeUrl);
    return;
  }
  ok(res, { authorizeUrl, state });
});

/**
 * GET /api/github/callback — GitHub redirects here after approval.
 * Validates the CSRF state (cookie ↔ URL), completes the connection for the
 * still-authenticated DevDNA session, then returns to the frontend.
 */
export const callback = asyncHandler(async (req: Request, res: Response) => {
  const state = String(req.query.state ?? '');
  const code = String(req.query.code ?? '');
  const cookieState = String(req.cookies?.[OAUTH_STATE_COOKIE] ?? '');
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/github' });

  if (req.query.error) {
    redirectErr(res, String(req.query.error));
    return;
  }
  if (!state || !stateMatches(state, cookieState)) {
    redirectErr(res, 'oauth_state_mismatch');
    return;
  }
  if (!code) {
    redirectErr(res, 'missing_code');
    return;
  }
  if (!req.user) {
    res.redirect(`${frontendOrigin()}/login?next=/github&error=session_expired`);
    return;
  }

  try {
    await connectGitHub(String(req.user._id), code, req);
    res.redirect(`${frontendOrigin()}/github?connected=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'connection_failed';
    redirectErr(res, message);
  }
});

// ─── Status / profile ────────────────────────────────────────────────────────

/** GET /api/github/status — connection state + latest sync job. */
export const status = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');

  const account = await GitHubAccount.findOne({ userId: req.user._id });
  const latestJob = await GitHubSyncJob.findOne({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  ok(res, {
    configured: isOAuthConfigured(),
    connected: Boolean(account),
    account: account
      ? {
          login: account.login,
          avatarUrl: account.avatarUrl,
          htmlUrl: account.htmlUrl,
          publicRepos: account.publicRepos,
          followers: account.followers,
          following: account.following,
          connectedAt: account.connectedAt,
          lastSyncedAt: account.lastSyncedAt,
          syncStatus: account.syncStatus
        }
      : undefined,
    latestJob: latestJob
      ? {
          id: String(latestJob._id),
          status: latestJob.status,
          progress: latestJob.progress,
          currentStep: latestJob.currentStep,
          repositoriesFound: latestJob.repositoriesFound,
          repositoriesProcessed: latestJob.repositoriesProcessed,
          commitsProcessed: latestJob.commitsProcessed,
          error: latestJob.error,
          startedAt: latestJob.startedAt,
          completedAt: latestJob.completedAt
        }
      : undefined
  });
});

/** GET /api/github/profile — the connected GitHub profile (never the token). */
export const profile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const account = await requireAccount(String(req.user._id));

  const [repoCount, commitCount] = await Promise.all([
    Repository.countDocuments({ userId: req.user._id }),
    Commit.countDocuments({ userId: req.user._id })
  ]);

  ok(res, {
    login: account.login,
    name: account.name,
    email: account.email,
    avatarUrl: account.avatarUrl,
    htmlUrl: account.htmlUrl,
    bio: account.bio,
    company: account.company,
    location: account.location,
    blog: account.blog,
    publicRepos: account.publicRepos,
    followers: account.followers,
    following: account.following,
    scope: account.scope,
    connectedAt: account.connectedAt,
    lastSyncedAt: account.lastSyncedAt,
    syncStatus: account.syncStatus,
    stats: { repositories: repoCount, commits: commitCount }
  });
});

// ─── Sync ────────────────────────────────────────────────────────────────────

/** POST /api/github/sync — queue a synchronization job and return immediately. */
export const sync = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const userId = String(req.user._id);

  const account = await requireAccount(userId);
  if (account.syncStatus === 'syncing') {
    const running = await GitHubSyncJob.findOne({
      userId: req.user._id,
      status: { $in: ['QUEUED', 'RUNNING'] }
    });
    if (running) {
      ok(res, { jobId: String(running._id), status: running.status, reused: true }, 'Sync already running', 202);
      return;
    }
  }

  const { job } = await startSync(userId, 'manual');
  // Fire-and-forget: the HTTP response returns now; progress flows via sockets
  // and GET /api/github/sync/:jobId. Errors land on the job, not the request.
  void runSyncJob(String(job._id));

  ok(res, { jobId: String(job._id), status: 'QUEUED', reused: false }, 'Synchronization started', 202);
});

/** GET /api/github/sync/:jobId — poll a job (fallback for no-socket clients). */
export const syncStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const job = await GitHubSyncJob.findOne({
    _id: req.params.jobId,
    userId: req.user._id
  });
  if (!job) throw notFound('Sync job not found');

  ok(res, {
    id: String(job._id),
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    repositoriesFound: job.repositoriesFound,
    repositoriesProcessed: job.repositoriesProcessed,
    commitsProcessed: job.commitsProcessed,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  });
});

// ─── Disconnect ──────────────────────────────────────────────────────────────

/**
 * DELETE /api/github/disconnect — remove the credential, optionally purge all
 * GitHub-derived data (§32, §47). Confirmation: ?deleteData=true or JSON body.
 */
export const disconnect = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const deleteData =
    req.query.deleteData === 'true' ||
    (typeof req.body?.deleteData === 'boolean' ? req.body.deleteData : false);

  const result = await disconnectGitHub(String(req.user._id), req, { deleteData });
  ok(res, result, deleteData ? 'GitHub disconnected and data deleted' : 'GitHub disconnected');
});

// ─── Repository browsing ─────────────────────────────────────────────────────

/**
 * GET /api/github/repositories — the user's synced repositories with search,
 * language filter, sorting, and pagination (§36). Ownership always scoped.
 */
export const listRepositories = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
  const search = String(req.query.search ?? '').trim();
  const language = String(req.query.language ?? '').trim();
  const sort = String(req.query.sort ?? 'pushed');

  const filter: Record<string, unknown> = { userId: req.user._id };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  if (language) filter.primaryLanguage = language;

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    pushed: { pushedAt: -1 },
    updated: { githubUpdatedAt: -1 },
    stars: { stars: -1 },
    name: { name: 1 }
  };

  const [items, total, languagesAgg] = await Promise.all([
    Repository.find(filter)
      .sort(sortMap[sort] ?? sortMap.pushed!)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Repository.countDocuments(filter),
    Repository.distinct('primaryLanguage', { userId: req.user._id })
  ]);

  ok(res, {
    repositories: items.map((r) => ({
      id: String(r._id),
      githubId: r.githubId,
      name: r.name,
      fullName: r.fullName,
      description: r.description,
      private: r.private,
      fork: r.fork,
      archived: r.archived,
      htmlUrl: r.htmlUrl,
      primaryLanguage: r.primaryLanguage,
      languages: r.languages instanceof Map ? Object.fromEntries(r.languages) : (r.languages ?? {}),
      topics: r.topics,
      stars: r.stars,
      forks: r.forks,
      openIssues: r.openIssues,
      size: r.size,
      defaultBranch: r.defaultBranch,
      pushedAt: r.pushedAt,
      githubUpdatedAt: r.githubUpdatedAt,
      readmeExists: r.readmeExists,
      lastSyncedAt: r.lastSyncedAt
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    languages: (languagesAgg as (string | null)[]).filter((l): l is string => Boolean(l)).sort()
  });
});

/** GET /api/github/repositories/:id — full detail for the user's own repo (§37). */
export const repositoryDetail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');

  const repo = await Repository.findOne({
    _id: req.params.id,
    userId: req.user._id // IDOR guard (§40)
  });
  if (!repo) throw notFound('Repository not found');

  const repoId = repo._id;
  const [commits, issues, pulls, releases, branches, contributors, commitCount] =
    await Promise.all([
      Commit.find({ repositoryId: repoId }).sort({ committedAt: -1 }).limit(20).lean(),
      Issue.find({ repositoryId: repoId }).sort({ createdAt: -1 }).limit(20).lean(),
      PullRequest.find({ repositoryId: repoId }).sort({ createdAt: -1 }).limit(20).lean(),
      Release.find({ repositoryId: repoId }).sort({ publishedAt: -1 }).limit(10).lean(),
      Branch.find({ repositoryId: repoId }).sort({ isDefault: -1, name: 1 }).limit(30).lean(),
      Contributor.find({ repositoryId: repoId }).sort({ contributions: -1 }).limit(20).lean(),
      Commit.countDocuments({ repositoryId: repoId })
    ]);

  ok(res, {
    repository: {
      id: String(repo._id),
      githubId: repo.githubId,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      private: repo.private,
      fork: repo.fork,
      archived: repo.archived,
      htmlUrl: repo.htmlUrl,
      defaultBranch: repo.defaultBranch,
      primaryLanguage: repo.primaryLanguage,
      languages: repo.languages instanceof Map ? Object.fromEntries(repo.languages) : (repo.languages ?? {}),
      topics: repo.topics,
      size: repo.size,
      stars: repo.stars,
      forks: repo.forks,
      watchers: repo.watchers,
      openIssues: repo.openIssues,
      license: repo.license,
      hasIssues: repo.hasIssues,
      hasWiki: repo.hasWiki,
      hasPages: repo.hasPages,
      hasDiscussions: repo.hasDiscussions,
      readmeExists: repo.readmeExists,
      readmeSize: repo.readmeSize,
      githubCreatedAt: repo.githubCreatedAt,
      githubUpdatedAt: repo.githubUpdatedAt,
      pushedAt: repo.pushedAt,
      lastSyncedAt: repo.lastSyncedAt
    },
    stats: {
      commitCount,
      issueCount: issues.length,
      pullRequestCount: pulls.length,
      releaseCount: releases.length,
      branchCount: branches.length,
      contributorCount: contributors.length
    },
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      authorLogin: c.authorLogin,
      committedAt: c.committedAt,
      htmlUrl: c.htmlUrl
    })),
    issues: issues.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: i.labels,
      createdAt: i.createdAt,
      closedAt: i.closedAt,
      htmlUrl: i.htmlUrl
    })),
    pullRequests: pulls.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      draft: p.draft,
      mergedAt: p.mergedAt,
      authorLogin: p.authorLogin,
      createdAt: p.createdAt,
      htmlUrl: p.htmlUrl
    })),
    releases: releases.map((r) => ({
      tagName: r.tagName,
      name: r.name,
      prerelease: r.prerelease,
      publishedAt: r.publishedAt,
      htmlUrl: r.htmlUrl
    })),
    branches: branches.map((b) => ({
      name: b.name,
      protected: b.protected,
      isDefault: b.isDefault
    })),
    contributors: contributors.map((c) => ({
      login: c.login,
      contributions: c.contributions
    }))
  });
});
