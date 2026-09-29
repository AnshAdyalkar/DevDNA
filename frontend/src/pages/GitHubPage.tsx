/**
 * /github — GitHub overview (Phase 3 §35, §53, §38).
 * Connection states: DISCONNECTED → CONNECTED → SYNCING → COMPLETED/FAILED.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleCheck,
  CircleX,
  Clock,
  GitFork,
  Github,
  Star,
  TriangleAlert
} from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader } from '../components/ui/FormFeedback';
import { useGitHubSync } from '../hooks/useGitHubSync';
import {
  fetchRepositories,
  type RepositorySummary
} from '../services/githubService';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

function formatWhen(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Prominent lifecycle badge (§53). */
function SyncBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'green' | 'amber' | 'red' | 'cyan' | 'slate'; label: string }> = {
    connected: { tone: 'green', label: 'Connected' },
    syncing: { tone: 'cyan', label: 'Syncing' },
    completed: { tone: 'green', label: 'Sync completed' },
    failed: { tone: 'red', label: 'Sync failed' },
    idle: { tone: 'slate', label: 'Idle' },
    error: { tone: 'red', label: 'Error' }
  };
  const info = map[status] ?? { tone: 'slate' as const, label: status };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

/** The four §38 empty/error states. */
function ConnectPrompt({ reason }: { reason?: string }) {
  const { status, connect: startConnect } = useGitHubSync();
  return (
    <Card className="mx-auto max-w-xl text-center">
      <Github className="mx-auto h-10 w-10 text-slate-500" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold text-white">Connect GitHub to build your Developer DNA.</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
        DevDNA requests read-only access to your public repositories, commits, issues, and pull
        requests. No write access. The token is stored encrypted and never shown.
      </p>
      {reason && (
        <div className="mt-4">
          <InlineAlert tone="error">{reason}</InlineAlert>
        </div>
      )}
      {status?.configured === false ? (
        <div className="mt-4">
          <InlineAlert tone="info">
            GitHub OAuth is not configured on this server yet — set GITHUB_CLIENT_ID and
            GITHUB_CLIENT_SECRET, then restart the API.
          </InlineAlert>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void startConnect()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90"
        >
          <Github className="h-4 w-4" aria-hidden />
          Connect GitHub
        </button>
      )}
    </Card>
  );
}

export function GitHubPage() {
  const user = useAuthStore((s) => s.user);
  const { status, job, syncing, loading, error, sync, disconnect } = useGitHubSync();
  const [recentRepos, setRecentRepos] = useState<RepositorySummary[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  // URL feedback from the OAuth redirect (?connected=1 / ?error=…)
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setOauthNotice('GitHub connected successfully');
    if (params.get('error')) setOauthNotice(`GitHub connection failed: ${params.get('error')}`);
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/github');
    }
  }, []);

  // Small preview of the newest repositories on the overview.
  useEffect(() => {
    if (status?.connected && job?.status === 'COMPLETED') {
      fetchRepositories({ limit: 5, sort: 'pushed' })
        .then((r) => setRecentRepos(r.repositories))
        .catch(() => setRecentRepos([]));
    }
  }, [status?.connected, job?.status]);

  // Toast on job completion/failure.
  useEffect(() => {
    if (job?.status === 'COMPLETED') {
      toast.success(`Sync completed — ${job.commitsProcessed ?? 0} commits across ${job.repositoriesFound ?? 0} repositories`);
    } else if (job?.status === 'FAILED') {
      toast.error(job.error ?? 'Sync failed');
    }
  }, [job?.status]);

  if (!user) return null;
  if (loading) return <PageLoader label="Loading GitHub status…" />;

  const account = status?.account;
  const jobFailed = job?.status === 'FAILED';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">GitHub</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your repositories, languages, and activity — the raw material for your Developer DNA.
        </p>
      </header>

      {oauthNotice && <InlineAlert tone={oauthNotice.includes('failed') ? 'error' : 'info'}>{oauthNotice}</InlineAlert>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      {!status?.connected ? (
        <ConnectPrompt />
      ) : (
        <>
          {/* Connection + sync control */}
          <Card>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {account?.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt={`${account.login} avatar`}
                    className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-700"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 ring-1 ring-slate-700">
                    <Github className="h-6 w-6 text-slate-400" aria-hidden />
                  </span>
                )}
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    @{account?.login} <SyncBadge status={syncing ? 'syncing' : jobFailed ? 'failed' : 'connected'} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {account?.publicRepos ?? 0} public repositories · {job?.commitsProcessed ?? 0} commits synced
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" aria-hidden />
                    Last synchronized: {formatWhen(account?.lastSyncedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => void sync()}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
                {confirming ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(false);
                        void disconnect(true).then(() => toast.success('GitHub disconnected — data deleted'));
                      }}
                      className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                    >
                      Delete data too
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(false);
                        void disconnect(false).then(() => toast.success('GitHub disconnected'));
                      }}
                      className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Keep data
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:text-red-300"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar (§28) */}
            {syncing && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{job?.currentStep ?? 'Preparing sync…'}</span>
                  <span>{job?.progress ?? 0}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${job?.progress ?? 0}%` }}
                  />
                </div>
              </div>
            )}
            {jobFailed && (
              <div className="mt-4">
                <InlineAlert tone="error">
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    {job?.error ?? 'The last synchronization failed.'}
                  </span>
                </InlineAlert>
              </div>
            )}
          </Card>

          {/* Stats overview (§35) */}
          <div className="grid gap-5 sm:grid-cols-3">
            <Card title="Repositories">
              <p className="text-2xl font-bold text-white">{recentRepos ? status?.account?.publicRepos ?? recentRepos.length : job?.repositoriesFound ?? '—'}</p>
              <Link to="/github/repositories" className="mt-2 inline-block text-xs text-cyan-400 hover:text-cyan-300">
                Browse repositories →
              </Link>
            </Card>
            <Card title="Commits synced">
              <p className="text-2xl font-bold text-white">{job?.commitsProcessed ?? 0}</p>
              <p className="mt-2 text-xs text-slate-500">Across your own repositories</p>
            </Card>
            <Card title="Languages">
              <p className="text-2xl font-bold text-white">
                {recentRepos ? new Set(recentRepos.map((r) => r.primaryLanguage).filter(Boolean)).size : '—'}
              </p>
              <p className="mt-2 text-xs text-slate-500">DNA analysis arrives in Phase 4</p>
            </Card>
          </div>

          {/* Recent repositories preview */}
          <Card title="Recently pushed" subtitle="Your latest activity across repositories.">
            {recentRepos === null ? (
              <p className="text-xs text-slate-500">Loading repositories…</p>
            ) : recentRepos.length === 0 ? (
              <p className="text-xs text-slate-500">No repositories were found.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentRepos.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/github/repositories/${r.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-3 transition hover:border-cyan-500/40"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                          {r.name}
                          {r.fork && <GitFork className="h-3.5 w-3.5 text-slate-500" aria-label="fork" />}
                          {r.archived && <Badge>archived</Badge>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{r.description ?? 'No description'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5" aria-hidden />
                          {r.stars}
                        </span>
                        {r.primaryLanguage && <span>{r.primaryLanguage}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="flex items-center gap-2 text-[11px] text-slate-600">
            <CircleCheck className="h-3 w-3" aria-hidden />
            Read-only access · token encrypted at rest ·
            <CircleX className="h-3 w-3" aria-hidden />
            disconnect anytime from this page
          </p>
        </>
      )}
    </div>
  );
}
