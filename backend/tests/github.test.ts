/**
 * Phase 3 backend tests (requirements §48-§49).
 *
 * The GitHub HTTP API is mocked at the `fetch` boundary — deterministic, no
 * live calls, no fake data in the app itself. Real MongoDB is used so upserts,
 * indexes, and ownership queries are exercised for real.
 */
import request from 'supertest';

import { app } from './helpers/app.js';
import { cookiesOf, registerAndLogin } from './helpers/auth.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Branch } from '../src/models/Branch.js';
import { Commit } from '../src/models/Commit.js';
import { Contributor } from '../src/models/Contributor.js';
import { GitHubAccount } from '../src/models/GitHubAccount.js';
import { GitHubSyncJob } from '../src/models/GitHubSyncJob.js';
import { Issue } from '../src/models/Issue.js';
import { PullRequest } from '../src/models/PullRequest.js';
import { Release } from '../src/models/Release.js';
import { Repository } from '../src/models/Repository.js';
import { User } from '../src/models/User.js';
import { encryptToken } from '../src/utils/crypto.js';

// Sync pipelines poll asynchronously; give them room.
jest.setTimeout(30_000);

// ─── GitHub API mock (fetch boundary) ───────────────────────────────────────

interface MockRoute {
  test: (url: string) => boolean;
  respond: () => Response;
}

let routes: MockRoute[] = [];
let fetchCalls: string[] = [];

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: new Headers({
      'content-type': 'application/json',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      ...headers
    })
  } as unknown as Response;
}

const GH_USER = {
  id: 9001,
  login: 'octocat',
  name: 'Octo Cat',
  email: 'octo@example.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/9001',
  html_url: 'https://github.com/octocat',
  bio: 'The original octocat',
  company: '@github',
  location: 'San Francisco',
  blog: 'https://github.blog',
  twitter_username: null,
  public_repos: 2,
  followers: 42,
  following: 7,
  created_at: '2011-01-25T18:44:36Z',
  updated_at: '2026-01-01T00:00:00Z'
};

const GH_REPOS = [
  {
    id: 111,
    name: 'hello-world',
    full_name: 'octocat/hello-world',
    description: 'My first repository',
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    html_url: 'https://github.com/octocat/hello-world',
    clone_url: 'https://github.com/octocat/hello-world.git',
    default_branch: 'main',
    language: 'TypeScript',
    size: 120,
    stargazers_count: 5,
    forks_count: 1,
    watchers_count: 5,
    open_issues_count: 2,
    topics: ['typescript', 'demo'],
    license: { spdx_id: 'MIT' },
    has_issues: true,
    has_wiki: true,
    has_pages: false,
    has_discussions: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    pushed_at: '2026-09-20T00:00:00Z'
  },
  {
    id: 222,
    name: 'forked-lib',
    full_name: 'octocat/forked-lib',
    description: null,
    private: false,
    fork: true,
    archived: false,
    disabled: false,
    html_url: 'https://github.com/octocat/forked-lib',
    clone_url: 'https://github.com/octocat/forked-lib.git',
    default_branch: 'master',
    language: 'Python',
    size: 900,
    stargazers_count: 0,
    forks_count: 300,
    watchers_count: 0,
    open_issues_count: 0,
    topics: [],
    license: null,
    has_issues: false,
    has_wiki: false,
    has_pages: false,
    has_discussions: false,
    created_at: '2023-05-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    pushed_at: '2026-08-15T00:00:00Z'
  }
];

const GH_COMMITS = [
  {
    sha: 'a'.repeat(40),
    html_url: `https://github.com/octocat/hello-world/commit/${'a'.repeat(40)}`,
    commit: {
      message: 'feat: initial commit',
      author: { name: 'Octo', email: 'octo@example.com', date: '2026-09-10T10:00:00Z' },
      committer: { name: 'Octo', email: 'octo@example.com', date: '2026-09-10T10:00:00Z' }
    },
    author: { login: 'octocat', id: 9001 }
  },
  {
    sha: 'b'.repeat(40),
    html_url: `https://github.com/octocat/hello-world/commit/${'b'.repeat(40)}`,
    commit: {
      message: 'fix: typo in readme',
      author: { name: 'Octo', email: 'octo@example.com', date: '2026-09-12T11:00:00Z' },
      committer: { name: 'Octo', email: 'octo@example.com', date: '2026-09-12T11:00:00Z' }
    },
    author: { login: 'octocat', id: 9001 }
  }
];

const GH_ISSUES = [
  {
    id: 501,
    number: 1,
    title: 'Bug: crash on start',
    state: 'open',
    user: { login: 'someone' },
    labels: [{ name: 'bug' }],
    created_at: '2026-09-01T00:00:00Z',
    closed_at: null,
    html_url: 'https://github.com/octocat/hello-world/issues/1'
  }
];

const GH_PULLS = [
  {
    id: 601,
    number: 2,
    title: 'Add CI',
    state: 'closed',
    draft: false,
    user: { login: 'octocat', id: 9001 },
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    closed_at: '2026-09-03T01:00:00Z',
    merged_at: '2026-09-03T01:00:00Z',
    html_url: 'https://github.com/octocat/hello-world/pull/2'
  }
];

const GH_RELEASES = [
  {
    id: 701,
    tag_name: 'v1.0.0',
    name: 'First release',
    draft: false,
    prerelease: false,
    published_at: '2026-09-05T00:00:00Z',
    html_url: 'https://github.com/octocat/hello-world/releases/tag/v1.0.0'
  }
];

function defaultRoutes(): MockRoute[] {
  return [
    { test: (u) => u === 'https://api.github.com/user', respond: () => jsonResponse(200, GH_USER) },
    // Page 2 must be matched BEFORE the generic repo listing (§16 pagination).
    { test: (u) => u.includes('page=2'), respond: () => jsonResponse(200, []) },
    {
      test: (u) => u.startsWith('https://api.github.com/user/repos'),
      // Include a Link header so pagination traversal is exercised (§16).
      respond: () =>
        jsonResponse(200, GH_REPOS, {
          link: '<https://api.github.com/user/repos?page=2&per_page=50>; rel="next"'
        })
    },
    {
      test: (u) => u.endsWith('/languages') && u.includes('hello-world'),
      respond: () => jsonResponse(200, { TypeScript: 8000, JavaScript: 2000 })
    },
    { test: (u) => u.endsWith('/languages'), respond: () => jsonResponse(200, { Python: 90000 }) },
    {
      test: (u) => u.endsWith('/readme'),
      respond: () =>
        jsonResponse(200, {
          size: 1024,
          encoding: 'base64',
          content: Buffer.from('# Hello World\nDevDNA test readme').toString('base64')
        })
    },
    {
      test: (u) => u.includes('/branches'),
      respond: () =>
        jsonResponse(200, [
          { name: 'main', protected: true, commit: { sha: 'a'.repeat(40) } },
          { name: 'dev', protected: false, commit: { sha: 'b'.repeat(40) } }
        ])
    },
    {
      test: (u) => u.includes('/commits') && u.includes('hello-world'),
      respond: () => jsonResponse(200, GH_COMMITS)
    },
    { test: (u) => u.includes('/commits'), respond: () => jsonResponse(200, []) },
    {
      test: (u) => u.includes('/issues') && u.includes('hello-world'),
      respond: () => jsonResponse(200, GH_ISSUES)
    },
    { test: (u) => u.includes('/issues'), respond: () => jsonResponse(200, []) },
    {
      test: (u) => u.includes('/pulls') && u.includes('hello-world'),
      respond: () => jsonResponse(200, GH_PULLS)
    },
    { test: (u) => u.includes('/pulls'), respond: () => jsonResponse(200, []) },
    {
      test: (u) => u.includes('/releases') && u.includes('hello-world'),
      respond: () => jsonResponse(200, GH_RELEASES)
    },
    { test: (u) => u.includes('/releases'), respond: () => jsonResponse(200, []) },
    {
      test: (u) => u.includes('/contributors') && u.includes('hello-world'),
      respond: () => jsonResponse(200, [{ id: 9001, login: 'octocat', contributions: 24 }])
    },
    { test: (u) => u.includes('/contributors'), respond: () => jsonResponse(200, []) }
  ];
}

beforeAll(async () => {
  await connectDatabase();
  // Deterministic fetch stub — every GitHub call in tests lands here.
  jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
    const url = input.toString();
    fetchCalls.push(url);
    for (const route of routes) {
      if (route.test(url)) return route.respond();
    }
    return jsonResponse(404, { message: 'Not Found (mock)' });
  });
});

afterAll(async () => {
  // Fire-and-forget syncs must settle before Mongo goes away.
  const { waitForActiveSyncs } = await import('../src/services/github/github.sync.js');
  await waitForActiveSyncs();
  jest.restoreAllMocks();
  await Promise.all([
    User.deleteMany({}),
    GitHubAccount.deleteMany({}),
    Repository.deleteMany({}),
    Commit.deleteMany({}),
    Issue.deleteMany({}),
    PullRequest.deleteMany({}),
    Release.deleteMany({}),
    Contributor.deleteMany({}),
    Branch.deleteMany({}),
    GitHubSyncJob.deleteMany({})
  ]);
  await disconnectDatabase();
});

beforeEach(async () => {
  // Wait for any fire-and-forget sync from the previous test, then reset state
  // (unique indexes — e.g. GitHubAccount.githubId — demand a clean slate).
  const { waitForActiveSyncs } = await import('../src/services/github/github.sync.js');
  await waitForActiveSyncs();
  await Promise.all([
    User.deleteMany({}),
    GitHubAccount.deleteMany({}),
    Repository.deleteMany({}),
    Commit.deleteMany({}),
    Issue.deleteMany({}),
    PullRequest.deleteMany({}),
    Release.deleteMany({}),
    Contributor.deleteMany({}),
    Branch.deleteMany({}),
    GitHubSyncJob.deleteMany({})
  ]);
  routes = defaultRoutes();
  fetchCalls = [];
});

/** Simulate a completed OAuth connection (token exchange bypassed, encrypted at rest). */
async function connectUser(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) throw new Error(`connectUser: ${email} not registered`);
  await GitHubAccount.findOneAndUpdate(
    { githubId: GH_USER.id },
    {
      userId: user._id,
      githubId: GH_USER.id,
      login: GH_USER.login,
      accessTokenEncrypted: encryptToken('gho_test_token'),
      scope: 'read:user user:email repo:status public_repo',
      publicRepos: GH_USER.public_repos,
      followers: GH_USER.followers,
      following: GH_USER.following
    },
    { upsert: true, new: true }
  );
  await User.updateOne(
    { _id: user._id },
    { githubId: GH_USER.id, githubUsername: GH_USER.login, githubConnected: true }
  );
}

interface PollResult {
  jobId: string;
  status: string;
  error?: string;
}

/** Drive a sync to completion by polling the job endpoint. */
async function runSync(cookie: string[]): Promise<PollResult> {
  const start = await request(app).post('/api/github/sync').set('Cookie', cookie);
  expect(start.status).toBe(202);
  const jobId = start.body.data.jobId as string;

  for (let i = 0; i < 200; i++) {
    const poll = await request(app).get(`/api/github/sync/${jobId}`).set('Cookie', cookie);
    const data = poll.body.data as PollResult;
    if (data.status === 'COMPLETED' || data.status === 'FAILED') {
      return { ...data, jobId };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Sync did not finish in time');
}

// ─── OAuth state protection (§4, §48) ───────────────────────────────────────

describe('GET /api/github/connect', () => {
  it('returns an authorize URL with CSRF state for authenticated users', async () => {
    const { cookie } = await registerAndLogin(app, 'connect1@example.com');
    const res = await request(app).get('/api/github/connect').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.authorizeUrl).toContain('https://github.com/login/oauth/authorize');
    expect(res.body.data.state).toHaveLength(48);
    expect(cookiesOf(res).join(' ')).toContain('devdna_gh_state');
    expect(cookiesOf(res).join(' ')).toContain('HttpOnly');
  });

  it('rejects unauthenticated users', async () => {
    const res = await request(app).get('/api/github/connect');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/github/callback', () => {
  it('rejects a mismatched state (CSRF protection)', async () => {
    const { cookie } = await registerAndLogin(app, 'csrf1@example.com');
    const res = await request(app)
      .get('/api/github/callback?code=goodcode&state=WRONGSTATE')
      .set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_state_mismatch');
  });

  it('rejects when no state cookie exists at all', async () => {
    const { cookie } = await registerAndLogin(app, 'csrf2@example.com');
    const res = await request(app)
      .get('/api/github/callback?code=goodcode&state=somestate')
      .set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_state_mismatch');
  });
});

// ─── Sync pipeline (§25-§28, §48) ───────────────────────────────────────────

describe('POST /api/github/sync', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/github/sync');
    expect(res.status).toBe(401);
  });

  it('fails cleanly when GitHub is not connected', async () => {
    const { cookie } = await registerAndLogin(app, 'nosync@example.com');
    const res = await request(app).post('/api/github/sync').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('syncs profile, repositories, languages, commits, issues, PRs, releases — and prevents duplicates on re-sync', async () => {
    const email = 'sync1@example.com';
    const { cookie } = await registerAndLogin(app, email);
    await connectUser(email);

    const first = await runSync(cookie);
    expect(first.status).toBe('COMPLETED');

    // Repositories upserted with normalized fields (§12, §14)
    const repos = await Repository.find().lean();
    expect(repos).toHaveLength(2);
    const hello = repos.find((r) => r.name === 'hello-world');
    expect(hello?.fullName).toBe('octocat/hello-world');
    expect(hello?.stars).toBe(5); // normalized from stargazers_count
    expect(hello?.fork).toBe(false);
    expect(hello?.topics).toEqual(expect.arrayContaining(['typescript', 'demo']));
    const fork = repos.find((r) => r.name === 'forked-lib');
    expect(fork?.fork).toBe(true); // forks stored but flagged (§45)

    // Languages stored as raw byte counts (§13)
    const langs =
      hello?.languages instanceof Map
        ? Object.fromEntries(hello.languages)
        : (hello?.languages ?? {});
    expect(langs).toEqual({ TypeScript: 8000, JavaScript: 2000 });

    // README metadata + hash stored, content not duplicated (§19)
    expect(hello?.readmeExists).toBe(true);
    expect(hello?.readmeSize).toBe(1024);
    expect(hello?.readmeHash).toMatch(/^[0-9a-f]{64}$/);

    // Commits stored, linked to the right repo (§15)
    const commits = await Commit.find({ repositoryId: hello?._id }).lean();
    expect(commits).toHaveLength(2);
    expect(commits[0]?.authorLogin).toBe('octocat');

    // Issues exclude PRs; PRs keep merge info (§21, §22)
    const issues = await Issue.find({ repositoryId: hello?._id }).lean();
    expect(issues).toHaveLength(1);
    const pulls = await PullRequest.find({ repositoryId: hello?._id }).lean();
    expect(pulls).toHaveLength(1);
    expect(pulls[0]?.mergedAt).toBeTruthy();

    // Releases stored (§23)
    const releases = await Release.find({ repositoryId: hello?._id }).lean();
    expect(releases).toHaveLength(1);
    expect(releases[0]?.tagName).toBe('v1.0.0');

    // Branch metadata with default flagged (§18)
    const branches = await Branch.find({ repositoryId: hello?._id }).lean();
    expect(branches.map((b) => b.name).sort()).toEqual(['dev', 'main']);
    expect(branches.find((b) => b.name === 'main')?.isDefault).toBe(true);

    // Contributors stored (§24) — one row per (repo, contributor), so both
    // repositories carry octocat's contributions.
    const contributors = await Contributor.find({ repositoryId: hello?._id }).lean();
    expect(contributors).toHaveLength(1);
    expect(contributors[0]?.contributions).toBe(24);

    // Account sync bookkeeping
    const account = await GitHubAccount.findOne({ login: GH_USER.login }).lean();
    expect(account?.lastSyncedAt).toBeTruthy();
    expect(account?.syncStatus).toBe('idle');

    // Second sync: no duplicate records (§27)
    const second = await runSync(cookie);
    expect(second.status).toBe('COMPLETED');
    expect(await Repository.countDocuments()).toBe(2);
    expect(await Commit.countDocuments()).toBe(2);
    expect(await Issue.countDocuments()).toBe(1);
    expect(await PullRequest.countDocuments()).toBe(1);
    expect(await Release.countDocuments()).toBe(1);
    expect(await Contributor.countDocuments()).toBe(1);
  });

  it('marks the job FAILED and surfaces a friendly message when GitHub rate-limits mid-sync (§30)', async () => {
    const email = 'syncfail@example.com';
    const { cookie } = await registerAndLogin(app, email);
    await connectUser(email);

    routes = routes.map((r) =>
      r.test('https://api.github.com/user/repos')
        ? {
            test: r.test,
            respond: () =>
              jsonResponse(403, { message: 'API rate limit exceeded' }, {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1200)
              })
          }
        : r
    );

    const result = await runSync(cookie);
    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/rate limit/i);

    const job = await GitHubSyncJob.findOne({ status: 'FAILED' }).lean();
    expect(job?.error).toMatch(/rate limit/i);

    const account = await GitHubAccount.findOne({ login: GH_USER.login }).lean();
    expect(account?.syncStatus).toBe('error');
  });

  it('reuses the active job instead of starting a parallel sync (§51)', async () => {
    const { startSync } = await import('../src/services/github/github.sync.js');
    const email = 'syncdup@example.com';
    await registerAndLogin(app, email);
    await connectUser(email);
    const user = await User.findOne({ email });

    // With a QUEUED job present, a second start must reuse it — even though
    // the mocked GitHub API finishes instantly in tests, the guard is what
    // protects production from parallel pipelines.
    const job = await GitHubSyncJob.create({ userId: user?._id, status: 'QUEUED' });
    const second = await startSync(String(user?._id), 'manual');

    expect(second.reused).toBe(true);
    expect(String(second.job._id)).toBe(String(job._id));
  });
});

// ─── Ownership / security (§40, §48) ────────────────────────────────────────

describe('repository ownership', () => {
  it('never returns another user’s repository (IDOR guard)', async () => {
    const email = 'owner1@example.com';
    const { cookie } = await registerAndLogin(app, email);
    await connectUser(email);
    await runSync(cookie);

    const repo = await Repository.findOne({ fullName: 'octocat/hello-world' }).lean();

    const { cookie: otherCookie } = await registerAndLogin(app, 'other2@example.com');
    const res = await request(app)
      .get(`/api/github/repositories/${String(repo?._id)}`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(404);
  });

  it('scopes repository listing to the requesting user', async () => {
    const email = 'scope1@example.com';
    const { cookie } = await registerAndLogin(app, email);
    await connectUser(email);
    await runSync(cookie);

    const res = await request(app).get('/api/github/repositories').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    for (const repo of res.body.data.repositories) {
      expect(repo.fullName).toMatch(/^octocat\//);
    }
  });
});

// ─── Status / profile endpoints (§33) ───────────────────────────────────────

describe('GET /api/github/status + profile', () => {
  it('reports connected:false before, account data after connection', async () => {
    const { cookie } = await registerAndLogin(app, 'status1@example.com');

    const before = await request(app).get('/api/github/status').set('Cookie', cookie);
    expect(before.body.data.connected).toBe(false);

    await connectUser('status1@example.com');
    const after = await request(app).get('/api/github/status').set('Cookie', cookie);
    expect(after.body.data.connected).toBe(true);
    expect(after.body.data.account.login).toBe('octocat');

    const profile = await request(app).get('/api/github/profile').set('Cookie', cookie);
    expect(profile.status).toBe(200);
    expect(profile.body.data.login).toBe('octocat');
    // Token never appears anywhere (§7, §41)
    expect(JSON.stringify(profile.body)).not.toContain('gho_');
    expect(JSON.stringify(profile.body)).not.toContain('accessTokenEncrypted');
  });

  it('returns 404 for profile when GitHub is not connected', async () => {
    const { cookie } = await registerAndLogin(app, 'status2@example.com');
    const res = await request(app).get('/api/github/profile').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

// ─── Disconnect (§32, §47, §48) ─────────────────────────────────────────────

describe('DELETE /api/github/disconnect', () => {
  it('removes the credential but keeps derived data by default, and purges on request', async () => {
    const email = 'bye1@example.com';
    const { cookie } = await registerAndLogin(app, email);
    await connectUser(email);
    await runSync(cookie);

    // Default: keep data, remove token (§47)
    const res = await request(app).delete('/api/github/disconnect').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.disconnected).toBe(true);
    expect(await GitHubAccount.countDocuments({ login: GH_USER.login })).toBe(0);
    expect(await Repository.countDocuments()).toBeGreaterThan(0);

    const user = await User.findOne({ email }).lean();
    expect(user?.githubConnected).toBe(false);
    expect(user?.githubId).toBeUndefined();

    // Reconnect, then delete with data (§32)
    await connectUser(email);
    await runSync(cookie);
    const res2 = await request(app)
      .delete('/api/github/disconnect?deleteData=true')
      .set('Cookie', cookie);
    expect(res2.status).toBe(200);
    expect(res2.body.data.deletedData.repositories).toBe(2);
    expect(await Repository.countDocuments()).toBe(0);
    expect(await Commit.countDocuments()).toBe(0);
    expect(await Issue.countDocuments()).toBe(0);
    expect(await PullRequest.countDocuments()).toBe(0);
    expect(await Release.countDocuments()).toBe(0);
    expect(await Contributor.countDocuments()).toBe(0);
    expect(await Branch.countDocuments()).toBe(0);
  });
});

// ─── Client behavior (§30, §31, §48) ────────────────────────────────────────

describe('GitHub client', () => {
  it('detects rate limits and never retries them (§30)', async () => {
    const { githubRequest } = await import('../src/services/github/github.client.js');
    routes = [
      {
        test: () => true,
        respond: () =>
          jsonResponse(403, { message: 'API rate limit exceeded' }, {
            'x-ratelimit-remaining': '0'
          })
      }
    ];

    const encrypted = encryptToken('gho_probe');
    await expect(githubRequest('/user', { token: encrypted })).rejects.toMatchObject({
      code: 'GITHUB_RATE_LIMITED',
      rateLimited: true
    });
    const callsAfterFirst = fetchCalls.length;
    await expect(githubRequest('/user', { token: encrypted })).rejects.toBeTruthy();
    // No retry storm on rate limits
    expect(fetchCalls.length).toBe(callsAfterFirst + 1);

    // 401 → immediate, single attempt (§31)
    routes = [{ test: () => true, respond: () => jsonResponse(401, { message: 'Bad credentials' }) }];
    await expect(githubRequest('/user', { token: encrypted })).rejects.toMatchObject({
      code: 'GITHUB_UNAUTHORIZED'
    });
    expect(fetchCalls.length).toBe(callsAfterFirst + 2);
  });

  it('retries temporary 5xx failures with backoff then succeeds (§31)', async () => {
    const { githubRequest } = await import('../src/services/github/github.client.js');
    let attempts = 0;
    routes = [
      {
        test: () => true,
        respond: () => {
          attempts += 1;
          return attempts < 3
            ? jsonResponse(503, { message: 'upstream' })
            : jsonResponse(200, { ok: true });
        }
      }
    ];
    const { data } = await githubRequest<{ ok: boolean }>('/user');
    expect(data.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('follows pagination Link headers (§16)', async () => {
    const { githubPaginate } = await import('../src/services/github/github.client.js');
    const pageOne = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    routes = [
      {
        test: (u) => u.includes('page=1'),
        respond: () =>
          jsonResponse(200, pageOne, {
            link: '<https://api.github.com/x?page=2&per_page=50>; rel="next"'
          })
      },
      { test: (u) => u.includes('page=2'), respond: () => jsonResponse(200, [{ id: 99 }]) }
    ];
    const { items } = await githubPaginate<{ id: number }>('/x');
    expect(items).toHaveLength(4);
    expect(items[3]?.id).toBe(99);
  });
});
