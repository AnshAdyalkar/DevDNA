/** /dashboard/repositories — repository-level intelligence list (§26). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader } from '../components/ui/FormFeedback';
import { fetchRepoAnalyses, type RepoAnalysisSummary } from '../services/dnaService';

function complexityTone(level: string): 'green' | 'cyan' | 'amber' | 'red' {
  if (['Minimal', 'Simple'].includes(level)) return 'green';
  if (level === 'Moderate') return 'cyan';
  if (level === 'Advanced') return 'amber';
  return 'red';
}

function metricCell(label: string, value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? `${label}: n/a` : `${label}: ${value}${suffix}`;
}

export function DnaRepositoriesPage() {
  const [repos, setRepos] = useState<RepoAnalysisSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRepoAnalyses()
      .then((r) => setRepos(r.repositories))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load repository analyses'));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <InlineAlert tone="error">{error}</InlineAlert>
        <Link to="/dashboard/dna" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Developer DNA
        </Link>
      </div>
    );
  }
  if (repos === null) return <PageLoader label="Loading repository intelligence…" />;

  if (repos.length === 0) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="text-sm font-semibold text-white">No repository analyses yet</h2>
        <p className="mt-2 text-xs text-slate-400">
          Run a Developer DNA analysis from the dashboard first — repositories with synchronized
          code are analyzed automatically.
        </p>
        <Link to="/dashboard/dna" className="mt-4 inline-block text-xs text-cyan-400 hover:text-cyan-300">
          ← Back to Developer DNA
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link to="/dashboard/dna" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Developer DNA
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Repository intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">
          {repos.length} repositories analyzed — click one for full details.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {repos.map((r) => (
          <Link key={r.repositoryId} to={`/dashboard/repositories/${r.repositoryId}`} className="block">
            <Card className="h-full transition hover:border-cyan-500/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{r.fullName}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Analyzed {new Date(r.analyzedAt).toLocaleDateString()}
                  </p>
                </div>
                {r.complexity && (
                  <Badge tone={complexityTone(r.complexity.level)}>
                    {r.complexity.level} · {r.complexity.complexityScore}
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.primaryLanguage && <Badge tone="cyan">{r.primaryLanguage}</Badge>}
                {(r.technologies ?? []).slice(0, 5).map((t) => (
                  <span key={t} className="rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300">
                    {t}
                  </span>
                ))}
                {(r.technologies?.length ?? 0) > 5 && (
                  <span className="text-[11px] text-slate-500">+{(r.technologies?.length ?? 0) - 5}</span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                <div>
                  <dt className="text-slate-500">Documentation</dt>
                  <dd>{metricCell('Score', r.documentation.documentationScore)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Testing</dt>
                  <dd>{metricCell('Score', r.testing.testingScore)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lines (est.)</dt>
                  <dd>{r.metrics.linesOfCode.toLocaleString()}</dd>
                </div>
              </dl>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
