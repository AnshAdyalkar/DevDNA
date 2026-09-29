/**
 * GitHub repository fetchers + normalization (Phase 3 §11, §13, §14, §18-§20).
 * GitHub snake_case → DevDNA camelCase happens here and nowhere else.
 */
import { createHash } from 'node:crypto';

import { githubPaginate, githubRequest } from './github.client.js';

// File-manifest limits (Phase 4 intelligence input): enough signal for
// static analysis without storing megabytes per repository.
const MANIFEST_MAX_FILES = 2_000;
const MANIFEST_MAX_DEPTH = 8;
const MANIFEST_EXCLUDED = /(^|\/)(node_modules|\.git|dist|build|out|\.next|coverage|vendor|__pycache__|\.venv|venv|target|\.idea|\.vscode)(\/|$)/i;

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  html_url: string;
  clone_url: string | null;
  default_branch: string | null;
  language: string | null;
  size: number;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  topics?: string[];
  license: { spdx_id?: string; name?: string } | null;
  has_issues: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_discussions: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
}

/** DevDNA-normalized repository shape — shared by sync + upsert code. */
export interface NormalizedRepo {
  githubId: number;
  name: string;
  fullName: string;
  description?: string | undefined;
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  htmlUrl: string;
  cloneUrl?: string | undefined;
  defaultBranch: string;
  primaryLanguage?: string | undefined;
  size: number;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  topics: string[];
  license?: string | undefined;
  hasIssues: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDiscussions: boolean;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
  pushedAt?: Date | undefined;
}

function normalizeRepo(r: GhRepo): NormalizedRepo {
  return {
    githubId: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description ?? undefined,
    private: r.private,
    fork: r.fork,
    archived: r.archived,
    disabled: r.disabled,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url ?? undefined,
    defaultBranch: r.default_branch || 'main',
    primaryLanguage: r.language ?? undefined,
    size: r.size ?? 0,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    watchers: r.watchers_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    topics: Array.isArray(r.topics) ? r.topics : [],
    license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : undefined,
    hasIssues: r.has_issues ?? true,
    hasWiki: r.has_wiki ?? true,
    hasPages: r.has_pages ?? false,
    hasDiscussions: r.has_discussions ?? false,
    githubCreatedAt: new Date(r.created_at),
    githubUpdatedAt: new Date(r.updated_at),
    pushedAt: r.pushed_at ? new Date(r.pushed_at) : undefined
  };
}

/**
 * All repositories owned by the authenticated user (owner, not collaborator)
 * so Developer DNA reflects the user's own projects (§45 handles forks).
 */
export function fetchOwnRepositories(
  encryptedToken: string,
  maxPages = 10
): Promise<{ items: NormalizedRepo[]; truncated: boolean }> {
  return githubPaginate<GhRepo>('/user/repos?affiliation=owner&sort=pushed', {
    token: encryptedToken,
    maxPages
  }).then(({ items, truncated }) => ({ items: items.map(normalizeRepo), truncated }));
}

/** Raw language byte counts for one repository (§13 — stored as-is). */
export function fetchLanguages(
  encryptedToken: string,
  fullName: string
): Promise<Record<string, number>> {
  return githubRequest<Record<string, number>>(
    `/repos/${fullName}/languages`,
    { token: encryptedToken }
  ).then((r) => r.data);
}

interface GhBranch {
  name: string;
  protected: boolean;
  commit: { sha: string };
}

export interface NormalizedBranch {
  name: string;
  protected: boolean;
  isDefault: boolean;
  lastCommitSha?: string;
}

/** Branch metadata only — no commit history (§18). */
export async function fetchBranches(
  encryptedToken: string,
  fullName: string,
  defaultBranch: string
): Promise<NormalizedBranch[]> {
  const { items } = await githubPaginate<GhBranch>(`/repos/${fullName}/branches`, {
    token: encryptedToken,
    maxPages: 2 // metadata only; deep branch lists add API cost without value
  });
  return items.map((b) => ({
    name: b.name,
    protected: Boolean(b.protected),
    isDefault: b.name === defaultBranch,
    lastCommitSha: b.commit?.sha
  }));
}

interface GhReadme {
  size: number;
  content?: string;
  encoding?: string;
}

export interface ReadmeInfo {
  exists: boolean;
  size: number;
  /** SHA-256 of the decoded content — full text is intentionally not stored. */
  hash?: string | undefined;
  fetchedAt: Date;
}

// ─── File manifest (Phase 4) ───────────────────────────────────────────────

interface GitTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
}

export interface FileManifest {
  files: { path: string; size: number }[];
  truncated: boolean;
}

/**
 * Recursive file listing (paths + blob sizes, no contents) via the git trees
 * API — ONE request per repository (recursive=1). Bounded by entry count and
 * depth; vendored/build directories are dropped at collection time. Static
 * analysis only — no repository code is ever executed (§9, §30).
 */
export async function fetchFileManifest(
  encryptedToken: string,
  fullName: string,
  branch: string
): Promise<FileManifest> {
  try {
    const { data } = await githubRequest<{ tree: GitTreeEntry[]; truncated?: boolean }>(
      `/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { token: encryptedToken }
    );
    const files: { path: string; size: number }[] = [];
    let truncated = Boolean(data.truncated);

    for (const entry of data.tree ?? []) {
      if (files.length >= MANIFEST_MAX_FILES) {
        truncated = true;
        break;
      }
      if (entry.type !== 'blob') continue;
      if (MANIFEST_EXCLUDED.test(entry.path)) continue;
      const depth = entry.path.split('/').length;
      if (depth > MANIFEST_MAX_DEPTH) continue;
      files.push({ path: entry.path, size: entry.size ?? 0 });
    }
    return { files, truncated };
  } catch (error) {
    // Empty repositories have no tree — a manifest-less repo is valid.
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
      return { files: [], truncated: false };
    }
    throw error;
  }
}

/**
 * README metadata + content hash (§19). Python receives the hash plus can be
 * re-pointed at the raw content later; storing full README text per user in
 * MongoDB would duplicate public data without adding signal.
 */
export async function fetchReadme(encryptedToken: string, fullName: string): Promise<ReadmeInfo> {
  try {
    const { data } = await githubRequest<GhReadme>(`/repos/${fullName}/readme`, {
      token: encryptedToken
    });
    let hash: string | undefined;
    if (data.content && data.encoding === 'base64') {
      hash = createHash('sha256').update(Buffer.from(data.content, 'base64')).digest('hex');
    }
    return { exists: true, size: data.size ?? 0, hash, fetchedAt: new Date() };
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
      return { exists: false, size: 0, fetchedAt: new Date() };
    }
    throw error;
  }
}
