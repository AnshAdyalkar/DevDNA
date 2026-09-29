/** GitHub integration service — wraps /api/github endpoints (Phase 3 §33). */
import { apiDelete, apiGet, apiPost } from './api';

export interface GitHubAccountInfo {
  login: string;
  avatarUrl?: string;
  htmlUrl?: string;
  publicRepos: number;
  followers: number;
  following: number;
  connectedAt: string;
  lastSyncedAt?: string;
  syncStatus: 'idle' | 'syncing' | 'error';
}

export interface SyncJobInfo {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  currentStep?: string;
  repositoriesFound?: number;
  repositoriesProcessed?: number;
  commitsProcessed?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  account?: GitHubAccountInfo;
  latestJob?: SyncJobInfo;
}

export interface GitHubProfileInfo extends GitHubAccountInfo {
  name?: string;
  email?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  scope: string;
  stats: { repositories: number; commits: number };
}

export interface RepositorySummary {
  id: string;
  githubId: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  htmlUrl: string;
  primaryLanguage?: string;
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  size: number;
  defaultBranch: string;
  pushedAt?: string;
  githubUpdatedAt: string;
  readmeExists: boolean;
  lastSyncedAt: string;
}

export interface RepositoryList {
  repositories: RepositorySummary[];
  total: number;
  page: number;
  pages: number;
  languages: string[];
}

export interface RepositoryDetail {
  repository: RepositorySummary & {
    watchers: number;
    license?: string;
    hasIssues: boolean;
    hasWiki: boolean;
    hasPages: boolean;
    hasDiscussions: boolean;
    readmeSize: number;
    githubCreatedAt: string;
  };
  stats: {
    commitCount: number;
    issueCount: number;
    pullRequestCount: number;
    releaseCount: number;
    branchCount: number;
    contributorCount: number;
  };
  commits: {
    sha: string;
    message: string;
    authorLogin?: string;
    committedAt: string;
    htmlUrl?: string;
  }[];
  issues: {
    number: number;
    title: string;
    state: 'open' | 'closed';
    labels: string[];
    createdAt: string;
    closedAt?: string;
    htmlUrl?: string;
  }[];
  pullRequests: {
    number: number;
    title: string;
    state: 'open' | 'closed';
    draft: boolean;
    mergedAt?: string;
    authorLogin?: string;
    createdAt: string;
    htmlUrl?: string;
  }[];
  releases: {
    tagName: string;
    name?: string;
    prerelease: boolean;
    publishedAt?: string;
    htmlUrl?: string;
  }[];
  branches: { name: string; protected: boolean; isDefault: boolean }[];
  contributors: { login: string; contributions: number }[];
}

export function fetchGitHubStatus(): Promise<GitHubStatus> {
  return apiGet<GitHubStatus>('/github/status');
}

export function fetchGitHubProfile(): Promise<GitHubProfileInfo> {
  return apiGet<GitHubProfileInfo>('/github/profile');
}

export function startSync(): Promise<{ jobId: string; status: string; reused: boolean }> {
  return apiPost<{ jobId: string; status: string; reused: boolean }>('/github/sync').then(
    (r) => r.data
  );
}

export function fetchSyncJob(jobId: string): Promise<SyncJobInfo> {
  return apiGet<SyncJobInfo>(`/github/sync/${jobId}`);
}

export function disconnectGitHub(deleteData: boolean): Promise<void> {
  return apiDelete('/github/disconnect', undefined, {
    params: { deleteData }
  } as never).then(() => undefined);
}

export function fetchRepositories(params: {
  page?: number;
  limit?: number;
  search?: string;
  language?: string;
  sort?: 'pushed' | 'updated' | 'stars' | 'name';
}): Promise<RepositoryList> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.language) query.set('language', params.language);
  if (params.sort) query.set('sort', params.sort);
  const qs = query.toString();
  return apiGet<RepositoryList>(`/github/repositories${qs ? `?${qs}` : ''}`);
}

export function fetchRepositoryDetail(id: string): Promise<RepositoryDetail> {
  return apiGet<RepositoryDetail>(`/github/repositories/${id}`);
}

/** Begin the OAuth flow — the backend returns the authorize URL + sets state. */
export function getAuthorizeUrl(): Promise<{ authorizeUrl: string }> {
  return apiGet<{ authorizeUrl: string; state: string }>('/github/connect').then(
    (r) => r
  );
}
