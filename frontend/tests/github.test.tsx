/**
 * Frontend Phase 3 tests (requirement §50): connection states, sync button,
 * sync progress, repository list + filtering, detail page, disconnect flow,
 * error and loading states. GitHub services are mocked — no network.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as githubService from '@/services/githubService';
import * as syncSocket from '@/services/syncSocket';
import { GitHubPage } from '@/pages/GitHubPage';
import { GitHubRepositoriesPage } from '@/pages/GitHubRepositoriesPage';
import { GitHubRepositoryDetailPage } from '@/pages/GitHubRepositoryDetailPage';
import { useAuthStore } from '@/store/authStore';

const USER = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada-dev',
  email: 'ada@example.com',
  githubConnected: true,
  createdAt: '2026-01-01T00:00:00.000Z'
};

const DISCONNECTED: githubService.GitHubStatus = { configured: true, connected: false };

const CONNECTED: githubService.GitHubStatus = {
  configured: true,
  connected: true,
  account: {
    login: 'octocat',
    avatarUrl: 'https://example.com/a.png',
    publicRepos: 2,
    followers: 42,
    following: 7,
    connectedAt: '2026-09-01T00:00:00Z',
    lastSyncedAt: '2026-09-20T00:00:00Z',
    syncStatus: 'idle'
  },
  latestJob: {
    id: 'job1',
    status: 'COMPLETED',
    progress: 100,
    repositoriesFound: 2,
    commitsProcessed: 120
  }
};

const REPO_LIST: githubService.RepositoryList = {
  repositories: [
    {
      id: 'r1',
      githubId: 111,
      name: 'hello-world',
      fullName: 'octocat/hello-world',
      description: 'My first repository',
      private: false,
      fork: false,
      archived: false,
      htmlUrl: 'https://github.com/octocat/hello-world',
      primaryLanguage: 'TypeScript',
      languages: { TypeScript: 8000 },
      topics: ['typescript'],
      stars: 5,
      forks: 1,
      openIssues: 2,
      size: 120,
      defaultBranch: 'main',
      pushedAt: '2026-09-20T00:00:00Z',
      githubUpdatedAt: '2026-09-01T00:00:00Z',
      readmeExists: true,
      lastSyncedAt: '2026-09-20T00:00:00Z'
    },
    {
      id: 'r2',
      githubId: 222,
      name: 'py-tool',
      fullName: 'octocat/py-tool',
      description: 'Python utility',
      private: false,
      fork: true,
      archived: false,
      htmlUrl: 'https://github.com/octocat/py-tool',
      primaryLanguage: 'Python',
      languages: { Python: 900 },
      topics: [],
      stars: 0,
      forks: 9,
      openIssues: 0,
      size: 50,
      defaultBranch: 'main',
      pushedAt: '2026-08-01T00:00:00Z',
      githubUpdatedAt: '2026-08-01T00:00:00Z',
      readmeExists: false,
      lastSyncedAt: '2026-09-20T00:00:00Z'
    }
  ],
  total: 2,
  page: 1,
  pages: 1,
  languages: ['Python', 'TypeScript']
};

function renderPage(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/github" element={<GitHubPage />} />
          <Route path="/github/repositories" element={<GitHubRepositoriesPage />} />
          <Route path="/github/repositories/:id" element={<GitHubRepositoryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: USER, isLoading: false });
  vi.restoreAllMocks();
  vi.spyOn(syncSocket, 'onSyncProgress').mockReturnValue(() => undefined);
  vi.spyOn(syncSocket, 'connectSyncSocket').mockReturnValue({
    connected: true
  } as unknown as ReturnType<typeof syncSocket.connectSyncSocket>);
});

// ─── Connection states ───────────────────────────────────────────────────────

describe('GitHub connection state (§50)', () => {
  it('shows the connect prompt with security messaging when disconnected', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus').mockResolvedValue(DISCONNECTED);
    renderPage('/github');

    expect(
      await screen.findByText(/Connect GitHub to build your Developer DNA/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect github/i })
    ).toBeInTheDocument();
  });

  it('shows OAuth-not-configured guidance when the server lacks credentials', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus').mockResolvedValue({
      configured: false,
      connected: false
    });
    renderPage('/github');

    expect(
      await screen.findByText(/GitHub OAuth is not configured/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect github/i })).toBeNull();
  });

  it('shows the connected account with sync stats and a Sync Now button', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus').mockResolvedValue(CONNECTED);
    vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue(REPO_LIST);
    renderPage('/github');

    expect(await screen.findByText('@octocat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync now/i })).toBeEnabled();
    expect(screen.getByText(/Last synchronized/i)).toBeInTheDocument();
  });

  it('surfaces API errors on the overview', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus').mockRejectedValue(
      new Error('backend down')
    );
    renderPage('/github');
    expect(await screen.findByText(/Failed to load GitHub status/i)).toBeInTheDocument();
  });
});

// ─── Sync flow ───────────────────────────────────────────────────────────────

describe('sync flow (§50)', () => {
  it('starts a sync and reflects running progress', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus')
      .mockResolvedValueOnce(CONNECTED)
      .mockResolvedValue(CONNECTED);
    vi.spyOn(githubService, 'startSync').mockResolvedValue({
      jobId: 'job9',
      status: 'QUEUED',
      reused: false
    });
    vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue(REPO_LIST);
    renderPage('/github');

    fireEvent.click(await screen.findByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(githubService.startSync).toHaveBeenCalled();
      // Button flips to its in-flight label.
      expect(screen.getByRole('button', { name: /syncing…/i })).toBeInTheDocument();
    });
  });

  it('shows a progress bar with the current step while syncing', async () => {
    const syncing: githubService.GitHubStatus = {
      ...CONNECTED,
      account: { ...CONNECTED.account!, syncStatus: 'syncing' },
      latestJob: {
        id: 'job1',
        status: 'RUNNING',
        progress: 65,
        currentStep: 'Processing commits'
      }
    };
    vi.spyOn(githubService, 'fetchGitHubStatus').mockResolvedValue(syncing);
    renderPage('/github');

    expect(await screen.findByText('Processing commits')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });
});

// ─── Repository list ─────────────────────────────────────────────────────────

describe('repository list (§50)', () => {
  it('renders repositories with language, stars, and topics', async () => {
    vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue(REPO_LIST);
    renderPage('/github/repositories');

    expect(await screen.findByText('hello-world')).toBeInTheDocument();
    expect(screen.getByText('py-tool')).toBeInTheDocument();
    // TypeScript appears as a badge AND as a filter option.
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 synchronized repositories/i)).toBeInTheDocument();
  });

  it('filters by language via the dropdown (updates request params)', async () => {
    const spy = vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue(REPO_LIST);
    renderPage('/github/repositories');

    fireEvent.change(await screen.findByLabelText(/filter by language/i), {
      target: { value: 'Python' }
    });

    await waitFor(() => {
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({ language: 'Python' })
      );
    });
  });

  it('shows the empty state when no repositories match', async () => {
    vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue({
      repositories: [],
      total: 0,
      page: 1,
      pages: 0,
      languages: []
    });
    renderPage('/github/repositories');

    expect(await screen.findByText(/No repositories were found/i)).toBeInTheDocument();
  });

  it('shows an error state when the API call fails', async () => {
    vi.spyOn(githubService, 'fetchRepositories').mockRejectedValue(new Error('down'));
    renderPage('/github/repositories');

    expect(await screen.findByText(/Unable to load repositories/i)).toBeInTheDocument();
  });
});

// ─── Repository detail ───────────────────────────────────────────────────────

describe('repository detail (§50)', () => {
  const DETAIL: githubService.RepositoryDetail = {
    repository: {
      ...REPO_LIST.repositories[0],
      watchers: 5,
      license: 'MIT',
      hasIssues: true,
      hasWiki: true,
      hasPages: false,
      hasDiscussions: false,
      readmeSize: 1024,
      githubCreatedAt: '2024-01-01T00:00:00Z'
    },
    stats: {
      commitCount: 2,
      issueCount: 1,
      pullRequestCount: 1,
      releaseCount: 1,
      branchCount: 2,
      contributorCount: 1
    },
    commits: [
      {
        sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: 'feat: initial commit',
        authorLogin: 'octocat',
        committedAt: '2026-09-10T10:00:00Z',
        htmlUrl: 'https://github.com/octocat/hello-world/commit/a'
      }
    ],
    issues: [
      {
        number: 1,
        title: 'Bug: crash on start',
        state: 'open',
        labels: ['bug'],
        createdAt: '2026-09-01T00:00:00Z',
        htmlUrl: 'https://github.com/octocat/hello-world/issues/1'
      }
    ],
    pullRequests: [
      {
        number: 2,
        title: 'Add CI',
        state: 'closed',
        draft: false,
        mergedAt: '2026-09-03T01:00:00Z',
        authorLogin: 'octocat',
        createdAt: '2026-09-02T00:00:00Z',
        htmlUrl: 'https://github.com/octocat/hello-world/pull/2'
      }
    ],
    releases: [
      {
        tagName: 'v1.0.0',
        name: 'First release',
        prerelease: false,
        publishedAt: '2026-09-05T00:00:00Z',
        htmlUrl: 'https://github.com/octocat/hello-world/releases/tag/v1.0.0'
      }
    ],
    branches: [
      { name: 'main', protected: true, isDefault: true },
      { name: 'dev', protected: false, isDefault: false }
    ],
    contributors: [{ login: 'octocat', contributions: 24 }]
  };

  it('renders overview, languages, commits, issues, PRs, releases, branches', async () => {
    vi.spyOn(githubService, 'fetchRepositoryDetail').mockResolvedValue(DETAIL);
    renderPage('/github/repositories/r1');

    expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument();
    expect(screen.getByText('feat: initial commit')).toBeInTheDocument();
    expect(screen.getByText('Bug: crash on start')).toBeInTheDocument();
    expect(screen.getByText('Add CI')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    // Language appears as badge + legend entry.
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MIT license')).toBeInTheDocument();
  });

  it('shows an error state for a repository the user does not own', async () => {
    vi.spyOn(githubService, 'fetchRepositoryDetail').mockRejectedValue(
      new Error('not found')
    );
    renderPage('/github/repositories/otherusersrepo');

    expect(await screen.findByText(/Repository not found/i)).toBeInTheDocument();
  });
});

// ─── Disconnect flow ─────────────────────────────────────────────────────────

describe('disconnect flow (§50)', () => {
  it('asks whether to keep or delete GitHub-derived data (§32)', async () => {
    vi.spyOn(githubService, 'fetchGitHubStatus').mockResolvedValue(CONNECTED);
    vi.spyOn(githubService, 'fetchRepositories').mockResolvedValue(REPO_LIST);
    const disconnectSpy = vi
      .spyOn(githubService, 'disconnectGitHub')
      .mockResolvedValue(undefined);
    renderPage('/github');

    fireEvent.click(await screen.findByRole('button', { name: /disconnect/i }));

    expect(await screen.findByRole('button', { name: /delete data too/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep data/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /keep data/i }));

    await waitFor(() => {
      expect(disconnectSpy).toHaveBeenCalledWith(false);
    });
  });
});
