/** /dashboard/repositories/:id — full repository intelligence detail (§26). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader } from '../components/ui/FormFeedback';
import { fetchRepoAnalysis, type RepoAnalysisSummary } from '../services/dnaService';

export function DnaRepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repo, setRepo] = useState<RepoAnalysisSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchRepoAnalysis(id)
      .then((r) => {
        setRepo(r);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Repository analysis not found')
      );
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link to="/dashboard/repositories" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Repository intelligence
        </Link>
        <InlineAlert tone="error">{error}</InlineAlert>
      </div>
    );
  }
  if (!repo) return <PageLoader label="Loading repository analysis…" />;

  const complexityData = repo.complexity.factors ?? [];

  return (
    <div className="space-y-6">
      <header>
        <Link to="/dashboard/repositories" className="text-xs text-cyan-400 hover:text-cyan-300">
          ← Repository intelligence
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-white">
          {repo.fullName}
          {repo.projectType && <Badge tone="cyan">{repo.projectType.projectType}</Badge>}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Analysis v{repo.analysisVersion} · {new Date(repo.analyzedAt).toLocaleString()}
        </p>
      </header>

      {/* Overview strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Complexity', value: `${repo.complexity.complexityScore} (${repo.complexity.level})` },
          {
            label: 'Documentation',
            value: repo.documentation.documentationScore ?? 'n/a'
          },
          { label: 'Testing', value: repo.testing.testingScore ?? 'n/a' },
          { label: 'Files', value: repo.metrics.files }
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Languages */}
        <Card title="Languages" subtitle="GitHub byte counts, normalized.">
          <ul className="space-y-2">
            {repo.languages.map((l) => (
              <li key={l.name} className="text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>{l.name}</span>
                  <span className="text-slate-500">{l.percentage}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                    style={{ width: `${l.percentage}%` }}
                  />
                </div>
              </li>
            ))}
            {repo.languages.length === 0 && (
              <li className="text-xs text-slate-500">No language data available.</li>
            )}
          </ul>
        </Card>

        {/* Technologies */}
        <Card title="Technologies" subtitle="Detected from manifests, config files, topics, and languages.">
          <div className="flex flex-wrap gap-1.5">
            {repo.technologies.length === 0 ? (
              <p className="text-xs text-slate-500">No technologies detected.</p>
            ) : (
              repo.technologies.map((t) => (
                <span key={t} className="rounded-lg bg-slate-800/80 px-2 py-1 text-xs text-slate-300">
                  {t}
                </span>
              ))
            )}
          </div>
        </Card>

        {/* Code metrics */}
        <Card title="Code metrics" subtitle="Static estimates from the file manifest — no code is executed.">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            {[
              ['Files', repo.metrics.files],
              ['Source files', repo.metrics.sourceFiles],
              ['Test files', repo.metrics.testFiles],
              ['Documentation files', repo.metrics.documentationFiles],
              ['Configuration files', repo.metrics.configurationFiles],
              ['Lines of code (est.)', repo.metrics.linesOfCode],
              ['Large files (>100 KB)', repo.metrics.largeFiles]
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-slate-200">{typeof value === 'number' ? value.toLocaleString() : value}</dd>
              </div>
            ))}
          </dl>
          {repo.metrics.manifestTruncated && (
            <p className="mt-3 text-[11px] text-amber-300/80">
              Manifest was truncated — metrics cover the first 2,000 files.
            </p>
          )}
        </Card>

        {/* Complexity factors */}
        <Card title={`Complexity — ${repo.complexity.level}`} subtitle="Every point is explained by a factor.">
          {complexityData.length === 0 ? (
            <p className="text-xs text-slate-500">No complexity factors recorded.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={complexityData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="factor"
                    width={150}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
                    formatter={(value) => [`${value} pts`, 'Contribution'] as [string, string]}
                  />
                  <Bar dataKey="contribution" fill="#22d3ee" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Documentation detail */}
        <Card title="Documentation">
          {repo.documentation.documentationScore === null ? (
            <p className="text-xs text-slate-500">
              No README — documentation data unavailable (not scored as zero).
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                README present · {(repo.documentation.readmeLength / 1024).toFixed(1)} KB
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {repo.documentation.sectionsDetected.map((s) => (
                  <Badge key={s} tone="green">
                    {s}
                  </Badge>
                ))}
                {repo.documentation.sectionsDetected.length === 0 && (
                  <p className="text-xs text-slate-500">No standard sections detected.</p>
                )}
              </div>
            </>
          )}
        </Card>

        {/* Testing detail */}
        <Card title="Testing">
          {repo.testing.testingScore === null ? (
            <p className="text-xs text-slate-500">
              {repo.testing.notes[0] ?? 'Testing data unavailable.'}
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                {repo.testing.testFiles} test files across {repo.testing.sourceFiles} source files
                {repo.testing.sourceToTestRatio !== undefined &&
                  ` · ratio ${repo.testing.sourceToTestRatio}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {repo.testing.frameworks.map((f) => (
                  <Badge key={f} tone="cyan">
                    {f}
                  </Badge>
                ))}
                {repo.testing.frameworks.length === 0 && (
                  <p className="text-xs text-slate-500">No framework identified.</p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Architecture signals */}
      {(repo.architectureSignals?.length ?? 0) > 0 && (
        <Card title="Architecture signals">
          <div className="flex flex-wrap gap-1.5">
            {(repo.architectureSignals ?? []).map((s) => (
              <Badge key={s} tone="slate">
                {s}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
