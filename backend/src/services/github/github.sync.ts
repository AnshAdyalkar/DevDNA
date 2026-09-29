/**
 * GitHub synchronization pipeline (Phase 3 §25-§28, §51).
 *
 * Strategy:
 *  - One job per user; QUEUED → RUNNING → COMPLETED/FAILED.
 *  - Sequential per-repository processing with bounded pages — predictable
 *    API usage instead of N× parallel request storms (§26, §51).
 *  - Everything upserts on stable GitHub IDs (§27).
 *  - Incremental commits: when a repository was synced before, only commits
 *    pushed after `lastSyncedAt` are fetched via the GitHub `since` parameter
 *    (§17). First sync pulls the most recent ~200 commits per repository
 *    (4 pages × 50) — full-history imports are deferred until Phase 4 needs
 *    them, to protect the rate budget.
 *  - Progress is persisted on the job and mirrored to the user's Socket.IO
 *    room (§28-§29). Tokens never travel over sockets.
 */
import mongoose, { type Types } from 'mongoose';

import { Branch } from '../../models/Branch.js';
import { Commit } from '../../models/Commit.js';
import { Contributor } from '../../models/Contributor.js';
import { GitHubAccount, type GitHubAccountDocument } from '../../models/GitHubAccount.js';
import { GitHubSyncJob, type GitHubSyncJobDocument } from '../../models/GitHubSyncJob.js';
import { Issue } from '../../models/Issue.js';
import { PullRequest } from '../../models/PullRequest.js';
import { Release } from '../../models/Release.js';
import { Repository } from '../../models/Repository.js';
import { audit } from '../auditService.js';
import { logger } from '../../utils/logger.js';
import { emitToUser } from '../../sockets/index.js';
import { GitHubError } from './github.client.js';
import {
  fetchCommits,
  fetchContributors,
  fetchIssues,
  fetchPulls,
  fetchReleases
} from './github.activity.js';
import {
  fetchBranches,
  fetchFileManifest,
  fetchLanguages,
  fetchOwnRepositories,
  fetchReadme
} from './github.repositories.js';
import { githubRequest } from './github.client.js';

const STEP_WEIGHTS = {
  profile: 5,
  repositories: 15,
  languages: 10,
  metadata: 10,
  commits: 25,
  issues: 10,
  pullRequests: 10,
  releases: 5,
  finalizing: 10
} as const;

type StepName = keyof typeof STEP_WEIGHTS;

const STEP_LABELS: Record<StepName, string> = {
  profile: 'Retrieving GitHub profile',
  repositories: 'Fetching repositories',
  languages: 'Synchronizing languages',
  metadata: 'Synchronizing repository metadata',
  commits: 'Processing commits',
  issues: 'Synchronizing issues',
  pullRequests: 'Synchronizing pull requests',
  releases: 'Synchronizing releases',
  finalizing: 'Finalizing'
};

function baseProgress(step: StepName): number {
  const keys = Object.keys(STEP_WEIGHTS) as StepName[];
  const idx = keys.indexOf(step);
  return keys.slice(0, idx).reduce((sum, k) => sum + STEP_WEIGHTS[k], 0);
}

/** Persist progress and push it to the user's socket room. */
async function reportProgress(
  job: GitHubSyncJobDocument,
  userId: string,
  step: StepName,
  ratio: number
): Promise<void> {
  const progress = Math.min(99, Math.round(baseProgress(step) + STEP_WEIGHTS[step] * ratio));
  job.progress = progress;
  job.currentStep = step;
  await GitHubSyncJob.updateOne(
    { _id: job._id },
    { progress, currentStep: step }
  );
  emitToUser(userId, 'github:sync:progress', {
    jobId: String(job._id),
    progress,
    step: STEP_LABELS[step]
  });
}

/**
 * Track in-flight syncs so tests (and graceful shutdown) can wait for the
 * fire-and-forget pipelines to settle before dropping Mongo.
 */
const activeSyncs = new Set<Promise<void>>();

export function waitForActiveSyncs(): Promise<void> {
  return Promise.allSettled([...activeSyncs]).then(() => undefined);
}

/** Run the full pipeline for a persisted job. Fire-and-forget from the route. */
export async function runSyncJob(jobId: string): Promise<void> {
  const promise = runSyncJobInner(jobId);
  activeSyncs.add(promise);
  try {
    await promise;
  } finally {
    activeSyncs.delete(promise);
  }
}

async function runSyncJobInner(jobId: string): Promise<void> {
  const job = await GitHubSyncJob.findById(jobId);
  if (!job || job.status === 'CANCELLED') return;
  const userId = String(job.userId);

  const account = await GitHubAccount.findOne({ userId: job.userId });
  if (!account) {
    await failJob(job, userId, 'GitHub account is no longer connected');
    return;
  }

  try {
    job.status = 'RUNNING';
    job.startedAt = new Date();
    job.progress = 0;
    await job.save();
    emitToUser(userId, 'github:sync:started', { jobId: String(job._id), progress: 0 });
    audit('GITHUB_SYNC_STARTED', { userId, metadata: { jobId: String(job._id) } });

    // ── Profile refresh ────────────────────────────────────────────────
    await reportProgress(job, userId, 'profile', 0);
    const ghUser = await githubRequest<{
      public_repos: number;
      followers: number;
      following: number;
      login: string;
    }>('/user', { token: account.accessTokenEncrypted }).then((r) => r.data);
    await GitHubAccount.updateOne(
      { _id: account._id },
      {
        publicRepos: ghUser.public_repos ?? account.publicRepos,
        followers: ghUser.followers ?? account.followers,
        following: ghUser.following ?? account.following,
        syncStatus: 'syncing'
      }
    );
    await GitHubSyncJob.updateOne(
      { _id: job._id },
      { $set: { progress: baseProgress('repositories') } }
    );

    // ── Repository list ────────────────────────────────────────────────
    await reportProgress(job, userId, 'repositories', 0);
    const { items: repos } = await fetchOwnRepositories(account.accessTokenEncrypted);
    job.repositoriesFound = repos.length;
    await GitHubSyncJob.updateOne(
      { _id: job._id },
      { repositoriesFound: repos.length }
    );
    emitToUser(userId, 'github:sync:progress', {
      jobId: String(job._id),
      progress: baseProgress('languages'),
      step: `${repos.length} repositories found`
    });

    // ── Per-repository ingestion (sequential, rate-limit friendly) ─────
    let commitsTotal = 0;
    for (let i = 0; i < repos.length; i++) {
      const repoDto = repos[i] as (typeof repos)[number];
      const ratio = repos.length === 0 ? 1 : i / repos.length;

      const repo = await Repository.findOneAndUpdate(
        { userId: job.userId, githubId: repoDto.githubId },
        {
          $set: {
            name: repoDto.name,
            fullName: repoDto.fullName,
            description: repoDto.description ?? null,
            private: repoDto.private,
            fork: repoDto.fork,
            archived: repoDto.archived,
            disabled: repoDto.disabled,
            htmlUrl: repoDto.htmlUrl,
            cloneUrl: repoDto.cloneUrl ?? null,
            defaultBranch: repoDto.defaultBranch,
            primaryLanguage: repoDto.primaryLanguage ?? null,
            size: repoDto.size,
            stars: repoDto.stars,
            forks: repoDto.forks,
            watchers: repoDto.watchers,
            openIssues: repoDto.openIssues,
            topics: repoDto.topics,
            license: repoDto.license ?? null,
            hasIssues: repoDto.hasIssues,
            hasWiki: repoDto.hasWiki,
            hasPages: repoDto.hasPages,
            hasDiscussions: repoDto.hasDiscussions,
            githubCreatedAt: repoDto.githubCreatedAt,
            githubUpdatedAt: repoDto.githubUpdatedAt,
            pushedAt: repoDto.pushedAt ?? null,
            lastSyncedAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const repoId = repo._id as Types.ObjectId;
      const fullName = repo.fullName;

      // Languages (§13) — raw byte counts, no scoring here.
      await reportProgress(job, userId, 'languages', ratio);
      try {
        const languages = await fetchLanguages(account.accessTokenEncrypted, fullName);
        await Repository.updateOne({ _id: repoId }, { languages });
      } catch (error) {
        logger.warn('Language fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      // Metadata: README + branches (§18-§19).
      await reportProgress(job, userId, 'metadata', ratio);
      try {
        const [readme, manifest] = await Promise.all([
          fetchReadme(account.accessTokenEncrypted, fullName),
          fetchFileManifest(account.accessTokenEncrypted, fullName, repoDto.defaultBranch)
        ]);
        await Repository.updateOne(
          { _id: repoId },
          {
            readmeExists: readme.exists,
            readmeSize: readme.size,
            readmeHash: readme.hash ?? null,
            readmeUpdatedAt: readme.fetchedAt,
            fileManifest: manifest.files,
            fileManifestTruncated: manifest.truncated
          }
        );
      } catch (error) {
        logger.warn('README/manifest fetch failed — continuing', { fullName, error: (error as Error).message });
      }
      try {
        const branches = await fetchBranches(
          account.accessTokenEncrypted,
          fullName,
          repoDto.defaultBranch
        );
        if (branches.length > 0) {
          await Branch.bulkWrite(
            branches.map((b) => ({
              updateOne: {
                filter: { repositoryId: repoId, name: b.name },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    name: b.name,
                    protected: b.protected,
                    isDefault: b.isDefault,
                    lastCommitSha: b.lastCommitSha ?? null
                  }
                },
                upsert: true
              }
            }))
          );
        }
      } catch (error) {
        logger.warn('Branch fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      // Commits (§17) — incremental via `since` when we synced before.
      await reportProgress(job, userId, 'commits', ratio);
      try {
        const since =
          repo.lastSyncedAt && Date.now() - repo.lastSyncedAt.getTime() < 90 * 24 * 3600 * 1000
            ? repo.lastSyncedAt
            : undefined;
        const commits = await fetchCommits(account.accessTokenEncrypted, fullName, repoDto.defaultBranch, {
          since
        });
        if (commits.length > 0) {
          await Commit.bulkWrite(
            commits.map((c) => ({
              updateOne: {
                filter: { repositoryId: repoId, sha: c.sha },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    sha: c.sha,
                    authorGithubId: c.authorGithubId ?? null,
                    authorLogin: c.authorLogin ?? null,
                    message: c.message,
                    committedAt: c.committedAt,
                    authoredAt: c.authoredAt ?? null,
                    branch: repoDto.defaultBranch,
                    htmlUrl: c.htmlUrl
                  }
                },
                upsert: true
              }
            }))
          );
          commitsTotal += commits.length;
        }
      } catch (error) {
        logger.warn('Commit fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      // Issues / pull requests / releases / contributors.
      await reportProgress(job, userId, 'issues', ratio);
      try {
        const issues = await fetchIssues(account.accessTokenEncrypted, fullName);
        if (issues.length > 0) {
          await Issue.bulkWrite(
            issues.map((s) => ({
              updateOne: {
                filter: { repositoryId: repoId, githubId: s.githubId },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    githubId: s.githubId,
                    number: s.number,
                    title: s.title,
                    state: s.state,
                    authorLogin: s.authorLogin ?? null,
                    labels: s.labels,
                    createdAt: s.createdAt,
                    closedAt: s.closedAt ?? null,
                    htmlUrl: s.htmlUrl
                  }
                },
                upsert: true
              }
            }))
          );
        }
      } catch (error) {
        logger.warn('Issue fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      await reportProgress(job, userId, 'pullRequests', ratio);
      try {
        const pulls = await fetchPulls(account.accessTokenEncrypted, fullName);
        if (pulls.length > 0) {
          await PullRequest.bulkWrite(
            pulls.map((p) => ({
              updateOne: {
                filter: { repositoryId: repoId, githubId: p.githubId },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    githubId: p.githubId,
                    number: p.number,
                    title: p.title,
                    state: p.state,
                    draft: p.draft,
                    authorLogin: p.authorLogin ?? null,
                    authorGithubId: p.authorGithubId ?? null,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                    closedAt: p.closedAt ?? null,
                    mergedAt: p.mergedAt ?? null,
                    htmlUrl: p.htmlUrl
                  }
                },
                upsert: true
              }
            }))
          );
        }
      } catch (error) {
        logger.warn('Pull request fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      await reportProgress(job, userId, 'releases', ratio);
      try {
        const [releases, contributors] = await Promise.all([
          fetchReleases(account.accessTokenEncrypted, fullName),
          fetchContributors(account.accessTokenEncrypted, fullName)
        ]);
        if (releases.length > 0) {
          await Release.bulkWrite(
            releases.map((r) => ({
              updateOne: {
                filter: { repositoryId: repoId, githubId: r.githubId },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    githubId: r.githubId,
                    tagName: r.tagName,
                    name: r.name ?? null,
                    draft: r.draft,
                    prerelease: r.prerelease,
                    publishedAt: r.publishedAt ?? null,
                    htmlUrl: r.htmlUrl
                  }
                },
                upsert: true
              }
            }))
          );
        }
        if (contributors.length > 0) {
          await Contributor.bulkWrite(
            contributors.map((c) => ({
              updateOne: {
                filter: { repositoryId: repoId, githubId: c.githubId },
                update: {
                  $set: {
                    userId: job.userId,
                    repositoryId: repoId,
                    githubId: c.githubId,
                    login: c.login,
                    contributions: c.contributions
                  }
                },
                upsert: true
              }
            }))
          );
        }
      } catch (error) {
        logger.warn('Release/contributor fetch failed — continuing', { fullName, error: (error as Error).message });
      }

      await GitHubSyncJob.updateOne(
        { _id: job._id },
        {
          repositoriesProcessed: i + 1,
          commitsProcessed: commitsTotal
        }
      );
    }

    // ── Complete ───────────────────────────────────────────────────────
    job.status = 'COMPLETED';
    job.progress = 100;
    job.currentStep = 'finalizing';
    job.completedAt = new Date();
    await job.save();

    await GitHubAccount.updateOne(
      { _id: account._id },
      { syncStatus: 'idle', lastSyncedAt: new Date() }
    );

    emitToUser(userId, 'github:sync:completed', {
      jobId: String(job._id),
      progress: 100,
      repositories: repos.length,
      commits: commitsTotal
    });
    audit('GITHUB_SYNC_COMPLETED', {
      userId,
      metadata: { jobId: String(job._id), repositories: repos.length, commits: commitsTotal }
    });
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.message
        : 'Synchronization failed unexpectedly — please try again';
    await failJob(job, userId, message, account);
  }
}

async function failJob(
  job: GitHubSyncJobDocument,
  userId: string,
  message: string,
  account?: GitHubAccountDocument | null
): Promise<void> {
  job.status = 'FAILED';
  job.error = message;
  job.completedAt = new Date();
  await job.save();
  if (account) {
    await GitHubAccount.updateOne({ _id: account._id }, { syncStatus: 'error' });
  }
  emitToUser(userId, 'github:sync:failed', {
    jobId: String(job._id),
    error: message
  });
  audit('GITHUB_SYNC_FAILED', { userId, metadata: { jobId: String(job._id), error: message } });
}

/**
 * Return the active job for a user or create a fresh QUEUED one.
 * Prevents parallel syncs racing against each other (§51).
 */
export async function startSync(
  userId: string,
  trigger: 'manual' | 'auto' = 'manual'
): Promise<{ job: GitHubSyncJobDocument; reused: boolean }> {
  const active = await GitHubSyncJob.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    status: { $in: ['QUEUED', 'RUNNING'] }
  });
  if (active) return { job: active, reused: true };

  const job = await GitHubSyncJob.create({ userId, status: 'QUEUED', trigger });
  return { job, reused: false };
}

/** On boot: jobs stuck RUNNING from a crashed process are marked FAILED. */
export async function recoverStaleSyncJobs(): Promise<void> {
  const result = await GitHubSyncJob.updateMany(
    { status: { $in: ['QUEUED', 'RUNNING'] } },
    { $set: { status: 'FAILED', error: 'Interrupted by server restart — start a new sync' } }
  );
  if (result.modifiedCount > 0) {
    logger.warn(`Marked ${result.modifiedCount} interrupted sync job(s) as failed`);
  }
}
