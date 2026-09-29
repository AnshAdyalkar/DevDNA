/**
 * /github/repositories/:id — full repository detail (Phase 3 §37).
 * Raw synchronized data only — skill scoring arrives in Phase 4.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CircleDot, GitBranch, GitFork, GitPullRequest, Star, Tag, Users } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader } from '../components/ui/FormFeedback';
import {
  fetchRepositoryDetail,
  type RepositoryDetail
} from '../services/githubService';

function fmt(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function languageBar(languages: Record<string, number>): { name: string; pct: number }[] {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bytes]) => ({ name, pct: Math.round((bytes / total) * 100) }));
}

const BAR_COLORS = ['bg-cyan-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-500'];

export function GitHubRepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RepositoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchRepositoryDetail(id)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch(() => setError('Repository not found in your synchronized data.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader label="Loading repository…" />;
  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link to="/github/repositories" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← All repositories
        </Link>
        <InlineAlert tone="error">{error ?? 'Repository not found'}</InlineAlert>
      </div>
    );
  }

  const { repository: repo, stats } = detail;
  const langs = languageBar(repo.languages);

  return (
    <div className="space-y-6">
      <header>
        <Link to="/github/repositories" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← All repositories
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2.5 text-2xl font-bold tracking-tight text-white">
          {repo.fullName}
          {repo.fork && <Badge tone="slate"><GitFork className="h-3 w-3" aria-hidden /> fork</Badge>}
          {repo.archived && <Badge tone="amber">archived</Badge>}
          {repo.private && <Badge tone="amber">private</Badge>}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">{repo.description ?? 'No description'}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:text-cyan-300">
            View on GitHub ↗
          </a>
          <span className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5" aria-hidden /> {repo.stars} stars
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" aria-hidden /> {repo.forks} forks
          </span>
          {repo.primaryLanguage && <Badge tone="cyan">{repo.primaryLanguage}</Badge>}
          {repo.license && <span className="text-slate-500">{repo.license} license</span>}
        </div>
      </header>

      {/* Overview strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { icon: GitBranch, label: 'Commits', value: stats.commitCount },
          { icon: CircleDot, label: 'Issues', value: stats.issueCount },
          { icon: GitPullRequest, label: 'Pull requests', value: stats.pullRequestCount },
          { icon: Tag, label: 'Releases', value: stats.releaseCount },
          { icon: GitBranch, label: 'Branches', value: stats.branchCount },
          { icon: Users, label: 'Contributors', value: stats.contributorCount }
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <s.icon className="mx-auto h-4 w-4 text-slate-500" aria-hidden />
            <p className="mt-1.5 text-lg font-bold text-white">{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Languages (raw bytes → share; scoring comes later) */}
        <Card title="Languages" subtitle="Raw byte counts from GitHub.">
          {langs.length === 0 ? (
            <p className="text-xs text-slate-500">No language data — the repository may be empty.</p>
          ) : (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                {langs.map((l, i) => (
                  <div
                    key={l.name}
                    className={BAR_COLORS[i % BAR_COLORS.length]}
                    style={{ width: `${l.pct}%` }}
                    title={`${l.name} ${l.pct}%`}
                  />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-300">
                {langs.map((l, i) => (
                  <li key={l.name} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                    {l.name} <span className="text-slate-500">{l.pct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Topics + metadata */}
        <Card title="Topics & metadata">
          {repo.topics.length === 0 ? (
            <p className="text-xs text-slate-500">No topics set on GitHub.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {repo.topics.map((t) => (
                <span key={t} className="rounded-lg bg-slate-800/80 px-2 py-1 text-xs text-slate-300">
                  {t}
                </span>
              ))}
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-slate-500">Default branch</dt>
              <dd className="text-slate-200">{repo.defaultBranch}</dd>
            </div>
            <div>
              <dt className="text-slate-500">README</dt>
              <dd className="text-slate-200">{repo.readmeExists ? `Present (${(repo.readmeSize / 1024).toFixed(1)} KB)` : 'Missing'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="text-slate-200">{fmt(repo.githubCreatedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last pushed</dt>
              <dd className="text-slate-200">{fmt(repo.pushedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Size</dt>
              <dd className="text-slate-200">{(repo.size / 1024).toFixed(1)} MB</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last synced</dt>
              <dd className="text-slate-200">{fmt(repo.lastSyncedAt)}</dd>
            </div>
          </dl>
        </Card>

        {/* Commits */}
        <Card title={`Recent commits (${stats.commitCount})`}>
          {detail.commits.length === 0 ? (
            <p className="text-xs text-slate-500">No commits synchronized yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {detail.commits.map((c) => (
                <li key={c.sha} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">{c.message}</p>
                    <p className="mt-0.5 text-slate-500">
                      {c.authorLogin ?? 'unknown'} · {fmt(c.committedAt)}
                    </p>
                  </div>
                  <a
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-mono text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    {c.sha.slice(0, 7)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Pull requests */}
        <Card title={`Pull requests (${stats.pullRequestCount})`}>
          {detail.pullRequests.length === 0 ? (
            <p className="text-xs text-slate-500">No pull requests synchronized yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {detail.pullRequests.map((p) => (
                <li key={p.number} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">{p.title}</p>
                    <p className="mt-0.5 text-slate-500">
                      #{p.number} · {p.authorLogin ?? 'unknown'} · {fmt(p.createdAt)}
                    </p>
                  </div>
                  {p.mergedAt ? (
                    <Badge tone="cyan">merged</Badge>
                  ) : (
                    <Badge tone={p.state === 'open' ? 'green' : 'slate'}>{p.state}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Issues */}
        <Card title={`Issues (${stats.issueCount})`}>
          {detail.issues.length === 0 ? (
            <p className="text-xs text-slate-500">No issues synchronized yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {detail.issues.map((i) => (
                <li key={i.number} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">{i.title}</p>
                    <p className="mt-0.5 text-slate-500">
                      #{i.number} · {fmt(i.createdAt)}
                      {i.labels.length > 0 && ` · ${i.labels.join(', ')}`}
                    </p>
                  </div>
                  <Badge tone={i.state === 'open' ? 'green' : 'slate'}>{i.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Releases + branches */}
        <Card title={`Releases (${stats.releaseCount})`}>
          {detail.releases.length === 0 ? (
            <p className="text-xs text-slate-500">No releases published.</p>
          ) : (
            <ul className="space-y-2.5">
              {detail.releases.map((r) => (
                <li key={r.tagName} className="flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-medium text-slate-200">
                      {r.name ?? r.tagName}
                      {r.prerelease && <span className="ml-2 text-amber-300">pre-release</span>}
                    </p>
                    <p className="mt-0.5 text-slate-500">{fmt(r.publishedAt)}</p>
                  </div>
                  <Badge tone="cyan">{r.tagName}</Badge>
                </li>
              ))}
            </ul>
          )}
          <h4 className="mt-5 text-xs font-semibold text-slate-300">Branches</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.branches.map((b) => (
              <span
                key={b.name}
                className={`rounded-lg px-2 py-1 text-[11px] ${
                  b.isDefault ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30' : 'bg-slate-800/80 text-slate-300'
                }`}
              >
                {b.name}
                {b.protected && ' 🔒'}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Contributors */}
      <Card title={`Contributors (${stats.contributorCount})`} subtitle="Distinguishes personal projects from collaborations.">
        {detail.contributors.length === 0 ? (
          <p className="text-xs text-slate-500">No contributor data synchronized yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.contributors.map((c) => (
              <span
                key={c.login}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300"
              >
                <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                {c.login}
                <span className="text-slate-500">· {c.contributions} commits</span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
