/**
 * /dashboard/dna — Developer DNA dashboard (Phase 4 §25, §27, §37).
 * Every score is inspectable down to its evidence; missing data is shown
 * as missing, never as zero.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, ChevronDown, FlaskConical, Layers, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useDna } from '../hooks/useDna';
import { toast } from '../store/toastStore';

const PIE_COLORS = ['#22d3ee', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#94a3b8', '#f87171', '#a78bfa'];

function confidenceTone(c: number): 'green' | 'cyan' | 'amber' | 'red' {
  if (c >= 0.9) return 'green';
  if (c >= 0.7) return 'cyan';
  if (c >= 0.5) return 'amber';
  return 'red';
}

function confidenceLabel(c: number): string {
  if (c >= 0.9) return 'strong evidence';
  if (c >= 0.7) return 'good evidence';
  if (c >= 0.5) return 'moderate evidence';
  return 'limited evidence';
}

export function DnaPage() {
  const { profile, job, analyzing, loading, error, analyze } = useDna();
  const [openSkill, setOpenSkill] = useState<string | null>(null);

  useEffect(() => {
    if (job?.status === 'COMPLETED') {
      toast.success(`Analysis complete — ${job.skillsDetected ?? 0} skills detected`);
    } else if (job?.status === 'FAILED') {
      toast.error(job.error ?? 'Analysis failed');
    }
  }, [job?.status, job?.skillsDetected, job?.error]);

  if (loading) return <PageLoader label="Loading your Developer DNA…" />;

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <InlineAlert tone="error">{error}</InlineAlert>
        <button type="button" onClick={() => void analyze()} className={buttonClasses}>
          Run analysis
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <Sparkles className="mx-auto h-10 w-10 text-slate-500" aria-hidden />
        <h2 className="mt-4 text-lg font-semibold text-white">No Developer DNA yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
          Analyze your synchronized GitHub repositories to compute your skill profile.
          {analyzing ? ' Analysis is running…' : ''}
        </p>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={analyzing}
          className={`${buttonClasses} mt-5 w-auto px-5`}
        >
          {analyzing ? 'Analyzing…' : 'Analyze My Developer DNA'}
        </button>
      </Card>
    );
  }

  const summary = profile.summaryMetrics as Record<string, number>;
  const practices = profile.engineeringPractices as Record<string, number | string | null>;
  const languageData = profile.primaryLanguages.slice(0, 8);
  const topSkills = profile.skills.slice(0, 12);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Developer DNA</h1>
          <p className="mt-1 text-sm text-slate-400">
            {profile.repositoriesAnalyzed} repositories analyzed · v{profile.analysisVersion} ·{' '}
            {new Date(profile.analyzedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard/repositories" className="text-xs text-cyan-400 hover:text-cyan-300">
            Repository intelligence →
          </Link>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing}
            className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            {analyzing ? 'Analyzing…' : 'Re-analyze'}
          </button>
        </div>
      </header>

      {/* Live progress while analyzing */}
      {analyzing && (
        <Card>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{job?.currentStep ?? 'Preparing analysis…'}</span>
            <span>{job?.progress ?? 0}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${job?.progress ?? 0}%` }}
            />
          </div>
        </Card>
      )}

      {/* Overview (§25) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: Layers, label: 'Repositories analyzed', value: profile.repositoriesAnalyzed },
          { icon: BarChart3, label: 'Languages detected', value: summary.languagesDetected ?? profile.primaryLanguages.length },
          { icon: Sparkles, label: 'Technologies detected', value: summary.technologiesDetected ?? profile.technologies.length },
          { icon: FlaskConical, label: 'Skills detected', value: profile.skills.length }
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <s.icon className="mx-auto h-4 w-4 text-slate-500" aria-hidden />
            <p className="mt-1.5 text-2xl font-bold text-white">{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Project types */}
      {profile.projectTypes.length > 0 && (
        <Card title="Project types" subtitle="Detected from real repository evidence, with confidence.">
          <div className="flex flex-wrap gap-2">
            {profile.projectTypes.map((p) => (
              <span
                key={p.projectType}
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300"
                title={p.evidence.join(' · ')}
              >
                {p.projectType} <span className="text-slate-500">({Math.round(p.confidence * 100)}%)</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Language distribution */}
        {languageData.length > 0 && (
          <Card title="Language distribution" subtitle="Aggregated from GitHub byte counts across your repositories.">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={languageData} dataKey="percentage" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {languageData.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
                    formatter={(value) => [`${value}%`, ''] as [string, string]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              {languageData.map((l, i) => (
                <span key={l.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {l.name} {l.percentage}%
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Skill bars */}
        {topSkills.length > 0 && (
          <Card title="Skill intelligence" subtitle="Score = weighted, deterministic inputs. Confidence = evidence quality.">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSkills} layout="vertical" margin={{ left: 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    width={110}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
                    formatter={(value) => [`${value}/100`, 'Score'] as [string, string]}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {topSkills.map((s, i) => (
                      <Cell key={s.skill} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      {/* Skill cards with evidence (§25: every score inspectable) */}
      <Card title="Skills & evidence" subtitle="Click a skill to see exactly what supports its score.">
        {profile.skills.length === 0 ? (
          <p className="text-xs text-slate-500">
            Not enough data for skill detection — connect GitHub and sync repositories with code.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {profile.skills.map((skill, i) => {
              const open = openSkill === skill.skill;
              return (
                <motion.li
                  key={skill.skill}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03 }}
                  className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/50"
                >
                  <button
                    type="button"
                    onClick={() => setOpenSkill(open ? null : skill.skill)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-800/40"
                  >
                    <span className="w-10 shrink-0 text-lg font-bold text-white">{skill.score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-200">{skill.skill}</span>
                      <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-800">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                          style={{ width: `${skill.score}%` }}
                        />
                      </span>
                    </span>
                    <Badge tone={confidenceTone(skill.confidence)}>
                      {Math.round(skill.confidence * 100)}% · {confidenceLabel(skill.confidence)}
                    </Badge>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {open && (
                    <div className="border-t border-slate-800/80 px-4 py-3">
                      <ul className="space-y-1.5">
                        {skill.evidence.map((e, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-slate-400">
                            <Badge tone="slate">{e.type}</Badge>
                            <span>{e.value}</span>
                          </li>
                        ))}
                        {skill.evidence.length === 0 && (
                          <li className="text-xs text-slate-500">Insufficient evidence recorded.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Engineering practices + behavior */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Engineering practices" subtitle="Aggregated from measurable repository traits.">
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-slate-500">Avg documentation score</dt>
              <dd className="text-slate-200">{practices.averageDocumentationScore ?? 'data unavailable'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Avg testing score</dt>
              <dd className="text-slate-200">{practices.averageTestingScore ?? 'data unavailable'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">README coverage</dt>
              <dd className="text-slate-200">{practices.readmeCoverage ?? 0}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">Repos with CI / Docker</dt>
              <dd className="text-slate-200">
                {practices.repositoriesWithCi ?? 0} / {practices.repositoriesWithDocker ?? 0}
              </dd>
            </div>
          </dl>
        </Card>
        <Card title="Development behavior" subtitle="Factual observations from commit timestamps (UTC, as stored by GitHub).">
          <ul className="space-y-1.5">
            {profile.behavior.observations.length === 0 ? (
              <li className="text-xs text-slate-500">No commit data available.</li>
            ) : (
              profile.behavior.observations.map((o, i) => (
                <li key={i} className="text-xs leading-relaxed text-slate-400">
                  · {o}
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
