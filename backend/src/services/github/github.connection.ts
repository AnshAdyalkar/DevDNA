/**
 * GitHub connection lifecycle (Phase 3 §4, §32, §47):
 * connect (OAuth code → token → identity → account row) and disconnect
 * (token removal, optional GitHub-derived data deletion).
 */
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { Branch } from '../../models/Branch.js';
import { Commit } from '../../models/Commit.js';
import { Contributor } from '../../models/Contributor.js';
import { GitHubAccount } from '../../models/GitHubAccount.js';
import { Issue } from '../../models/Issue.js';
import { PullRequest } from '../../models/PullRequest.js';
import { Release } from '../../models/Release.js';
import { Repository } from '../../models/Repository.js';
import { User } from '../../models/User.js';
import { audit } from '../auditService.js';
import { encryptToken } from '../../utils/crypto.js';
import type { Request } from 'express';
import { exchangeCodeForToken, fetchGitHubUser } from './github.auth.js';

export interface ConnectedAccount {
  login: string;
  avatarUrl?: string | undefined;
  publicRepos: number;
  connectedAt: Date;
  scope: string;
}

/**
 * Complete the OAuth flow: exchange the code, fetch the identity, encrypt the
 * token, upsert the GitHubAccount, and link it to the DevDNA user.
 */
export async function connectGitHub(
  userId: string,
  code: string,
  req: Request
): Promise<ConnectedAccount> {
  const token = await exchangeCodeForToken(code);
  const encrypted = encryptToken(token.access_token);
  const ghUser = await fetchGitHubUser(encrypted);

  // A given GitHub identity can only be linked to one DevDNA account...
  const takenBy = await GitHubAccount.findOne({
    githubId: ghUser.id,
    userId: { $ne: new mongoose.Types.ObjectId(userId) }
  }).lean();
  if (takenBy) {
    throw Object.assign(new Error('This GitHub account is already linked to another DevDNA account'), {
      status: 409,
      code: 'GITHUB_ALREADY_LINKED'
    });
  }

  const account = await GitHubAccount.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(userId) },
    {
      userId,
      githubId: ghUser.id,
      login: ghUser.login,
      name: ghUser.name ?? undefined,
      email: ghUser.email ?? undefined,
      avatarUrl: ghUser.avatar_url ?? undefined,
      htmlUrl: ghUser.html_url ?? undefined,
      bio: ghUser.bio ?? undefined,
      company: ghUser.company ?? undefined,
      location: ghUser.location ?? undefined,
      blog: ghUser.blog ?? undefined,
      twitterUsername: ghUser.twitter_username ?? undefined,
      publicRepos: ghUser.public_repos ?? 0,
      followers: ghUser.followers ?? 0,
      following: ghUser.following ?? 0,
      accessTokenEncrypted: encrypted,
      tokenType: token.token_type || 'bearer',
      scope: token.scope ?? '',
      connectedAt: new Date(),
      syncStatus: 'idle'
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.updateOne(
    { _id: userId },
    { githubId: ghUser.id, githubUsername: ghUser.login, githubConnected: true }
  );

  audit('GITHUB_CONNECTED', {
    req,
    userId,
    metadata: { login: ghUser.login, scope: token.scope }
  });

  return {
    login: account.login,
    avatarUrl: account.avatarUrl ?? undefined,
    publicRepos: account.publicRepos,
    connectedAt: account.connectedAt,
    scope: account.scope
  };
}

export interface DisconnectResult {
  disconnected: boolean;
  /** How many GitHub-derived records were removed (only when requested). */
  deletedData?:
    | {
        repositories: number;
        commits: number;
        issues: number;
        pullRequests: number;
        releases: number;
      }
    | undefined;
}

/**
 * Disconnect GitHub: always revoke/remove the stored credential and mark the
 * account disconnected; GitHub-derived data is deleted only when the user
 * explicitly opts in (§32, §47).
 */
export async function disconnectGitHub(
  userId: string,
  req: Request,
  opts: { deleteData: boolean }
): Promise<DisconnectResult> {
  const account = await GitHubAccount.findOneAndDelete({
    userId: new mongoose.Types.ObjectId(userId)
  });

  await User.updateOne(
    { _id: userId },
    { $unset: { githubId: 1, githubUsername: 1 }, githubConnected: false }
  );

  let deleted: DisconnectResult['deletedData'];
  if (opts.deleteData) {
    const repoIds = (
      await Repository.find({ userId: new mongoose.Types.ObjectId(userId) })
        .select('_id')
        .lean()
    ).map((r) => r._id);

    const [repositories, commits, issues, pullRequests, releases] = await Promise.all([
      Repository.deleteMany({ userId }),
      Commit.deleteMany({ userId }),
      Issue.deleteMany({ userId }),
      PullRequest.deleteMany({ userId }),
      Release.deleteMany({ userId })
    ]);
    if (repoIds.length > 0) {
      await Promise.all([
        Contributor.deleteMany({ repositoryId: { $in: repoIds } }),
        Branch.deleteMany({ repositoryId: { $in: repoIds } })
      ]);
    }
    deleted = {
      repositories: repositories.deletedCount ?? 0,
      commits: commits.deletedCount ?? 0,
      issues: issues.deletedCount ?? 0,
      pullRequests: pullRequests.deletedCount ?? 0,
      releases: releases.deletedCount ?? 0
    };
  }
  void account;

  audit('GITHUB_DISCONNECTED', {
    req,
    userId,
    metadata: { deletedData: Boolean(opts.deleteData) }
  });

  return { disconnected: true, deletedData: deleted };
}

/** True when GitHub OAuth is configured on this deployment. */
export function githubConfigured(): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}
