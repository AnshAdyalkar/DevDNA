/**
 * /dashboard/growth/roadmap — Personalized roadmap (§23).
 * Phases unlock as prerequisites complete (§23), objectives are measurable
 * (§9), resources link to official docs only (§10), versions are explicit
 * (§29) and phases can be marked complete (§30).
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, CheckCircle2, Circle, ExternalLink, Lock, PlayCircle, RefreshCw } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useGrowth, type PhaseStatus } from '../hooks/useGrowth';

const PRIORITY_TONES = { HIGH: 'red', MEDIUM: 'amber', LOW: 'green' } as const;

function phaseState(
  phase: { completed: boolean; progressStatus?: PhaseStatus; prerequisites: string[] },
  phases: { id: string; completed: boolean; progressStatus?: PhaseStatus }[]
): { locked: boolean; status: PhaseStatus } {
  const prereqDone =
    phase.prerequisites.length === 0 ||
    phase.prerequisites.every((pid) => {
      const p = phases.find((x) => x.id === pid);
      return p ? p.completed || p.progressStatus === 'COMPLETED' : true;
    });
  const status: PhaseStatus = phase.progressStatus ?? (phase.completed ? 'COMPLETED' : prereqDone ? 'AVAILABLE' : 'LOCKED');
  return { locked: status === 'LOCKED', status };
}

export function GrowthRoadmapPage() {
  const { roadmap, outdated, analyzing, loading, error, regenerate, markPhase } = useGrowth();

  if (loading) return <PageLoader label="Loading your roadmap…" />;

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <InlineAlert tone="error">{error}</InlineAlert>
        <Link to="/dashboard/growth" className={buttonClasses}>
          Go to growth analysis
        </Link>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h2 className="text-lg font-semibold text-white">No roadmap yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
          Run the growth analysis and DevDNA will build an ordered, evidence-based
          learning roadmap for your target role.
          {analyzing ? ' Analysis is running…' : ''}
        </p>
        <Link to="/dashboard/growth" className={`${buttonClasses} mt-5 inline-block px-5`}>
          Go to growth analysis
        </Link>
      </Card>
    );
  }

  const doneCount = roadmap.phases.filter((p) => p.completed || p.progressStatus === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Your Roadmap</h1>
          <p className="mt-1 text-sm text-slate-400">
            {roadmap.targetRole} · v{roadmap.version} · {roadmap.phases.length} phases · est.{' '}
            {roadmap.estimatedDuration} · {doneCount}/{roadmap.phases.length} completed
          </p>
        </div>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={analyzing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Regenerate
        </button>
      </header>

      {outdated && (
        <InlineAlert tone="amber">
          Your Developer DNA has changed — regenerating will create roadmap v{roadmap.version + 1} without losing this one.
        </InlineAlert>
      )}

      <ol className="space-y-4">
        {roadmap.phases.map((phase, i) => {
          const { locked, status } = phaseState(phase, roadmap.phases);
          const done = status === 'COMPLETED';
          return (
            <motion.li
              key={phase.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className={locked ? 'opacity-60' : ''}
            >
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                      ) : locked ? (
                        <Lock className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                      ) : (
                        <PlayCircle className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden />
                      )}
                      <h2 className="text-base font-semibold text-white">
                        Phase {phase.order} — {phase.title}
                      </h2>
                      <Badge tone={PRIORITY_TONES[phase.priority]}>{phase.priority}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{phase.description}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Skills: {phase.skills.join(', ')} · {phase.estimatedDuration}
                      {phase.prerequisites.length > 0 && ` · unlocks after: ${phase.prerequisites.join(', ')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={done ? 'green' : locked ? 'slate' : 'cyan'}>{status}</Badge>
                    {!locked && !done && (
                      <button
                        type="button"
                        onClick={() => void markPhase(phase.id, 'COMPLETED')}
                        className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
                      >
                        Mark complete
                      </button>
                    )}
                    {done && (
                      <button
                        type="button"
                        onClick={() => void markPhase(phase.id, 'AVAILABLE')}
                        className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-500/40 hover:text-slate-200"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>

                {!locked && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Learning objectives</p>
                      <ul className="mt-1.5 space-y-1">
                        {phase.learningObjectives.map((obj, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-slate-300">
                            <Circle className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                            {obj}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Resources</p>
                      <ul className="mt-1.5 space-y-1">
                        {phase.resources.map((res, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-slate-300">
                            <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" aria-hidden />
                            {res.url ? (
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline"
                              >
                                {res.name}
                                <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden />
                              </a>
                            ) : (
                              <span>
                                {res.name} <span className="text-slate-500">({res.type})</span>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {!locked && phase.project && (
                  <p className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-medium text-slate-200">Practice:</span> {phase.project}
                  </p>
                )}
              </Card>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
