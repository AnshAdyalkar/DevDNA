/**
 * /github/repositories — searchable, filterable, paginated repository list
 * (Phase 3 §36). All data comes from the user's own sync — nothing hardcoded.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GitFork, Search, Star } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, inputClasses } from '../components/ui/FormFeedback';
import {
  fetchRepositories,
  type RepositoryList,
  type RepositorySummary
} from '../services/githubService';

const SORTS = [
  { value: 'pushed', label: 'Recently pushed' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'stars', label: 'Most stars' },
  { value: 'name', label: 'Name A–Z' }
] as const;

export function GitHubRepositoriesPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const search = params.get('search') ?? '';
  const language = params.get('language') ?? '';
  const sort = (params.get('sort') ?? 'pushed') as 'pushed' | 'updated' | 'stars' | 'name';

  const [data, setData] = useState<RepositoryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setLoading(true);
    fetchRepositories({ page, search, language, sort, limit: 12 })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch(() => setError('Unable to load repositories — run a sync first.'))
      .finally(() => setLoading(false));
  }, [page, search, language, sort]);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page'); // content filters reset paging
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Repositories</h1>
          <p className="mt-1 text-sm text-slate-400">
            {data ? `${data.total} synchronized repositories` : 'Your synchronized GitHub repositories.'}
          </p>
        </div>
        <Link to="/github" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← GitHub overview
        </Link>
      </header>

      {/* Search / filter / sort toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: searchInput });
          }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search repositories…"
            aria-label="Search repositories"
            className={`${inputClasses} pl-9`}
          />
        </form>
        <select
          value={language}
          onChange={(e) => update({ language: e.target.value || undefined })}
          aria-label="Filter by language"
          className={`${inputClasses} sm:w-48`}
        >
          <option value="">All languages</option>
          {(data?.languages ?? []).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          aria-label="Sort repositories"
          className={`${inputClasses} sm:w-48`}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {loading && !data ? (
        <PageLoader label="Loading repositories…" />
      ) : data && data.repositories.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-slate-300">No repositories were found.</p>
          <p className="mt-1 text-xs text-slate-500">
            {search || language
              ? 'Try clearing the search or language filter.'
              : 'Run a sync from the GitHub overview to import your repositories.'}
          </p>
        </Card>
      ) : (
        data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.repositories.map((r: RepositorySummary) => (
                <Link key={r.id} to={`/github/repositories/${r.id}`} className="block">
                  <Card className="h-full transition hover:border-cyan-500/40">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        {r.name}
                        {r.fork && <GitFork className="h-3.5 w-3.5 text-slate-500" aria-label="fork" />}
                      </h3>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                        <Star className="h-3.5 w-3.5" aria-hidden />
                        {r.stars}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-8 text-xs text-slate-400">
                      {r.description ?? 'No description'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {r.primaryLanguage && <Badge tone="cyan">{r.primaryLanguage}</Badge>}
                      {r.fork && <Badge>fork</Badge>}
                      {r.archived && <Badge tone="amber">archived</Badge>}
                      {r.private && <Badge tone="amber">private</Badge>}
                      {r.topics.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-md bg-slate-800/80 px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">
                      Updated{' '}
                      {new Date(r.pushedAt ?? r.githubUpdatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <nav className="flex items-center justify-center gap-2" aria-label="Repository pages">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {data.page} of {data.pages}
                </span>
                <button
                  type="button"
                  disabled={page >= data.pages}
                  onClick={() => update({ page: String(page + 1) })}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )
      )}
    </div>
  );
}
