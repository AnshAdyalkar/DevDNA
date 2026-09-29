/**
 * /dashboard/growth — Skill Gap Intelligence dashboard (§21, §22).
 * Target role selector (§16), real job progress (§20), evidence-backed gap
 * cards (§4, §22), regenerate banner (§28) and honest empty states (§36).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Compass,
  ExternalLink,
  Github,
  RefreshCw,
  Sparkles,
  Target
} from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useGrowth } from '../hooks/useGrowth';
import { toast } from '../store/toastStore';
import type { SkillGap } from '../services/growthService';

const KIND_LABELS: Record<SkillGap['kind'], string> = {
  demonstrated: 'Demonstrated below target',
  limited_evidence: 'Limited GitHub evidence',
  not_detected: 'Insufficient evidence'
};

const KIND_TONES: Record<SkillGap['kind'], 'green' | 'cyan' | 'amber' | 'red' | 'slate'> = {
  demonstrated: 'amber',
  limited_evidence: 'cyan',
  not_detected: 'slate'
};

const PRIORITY_TONES: Record<SkillGap['priority'], 'green' | 'cyan' | 'amber' | 'red'> = {
  HIGH: 'red',
  MEDIUM: 'amber',
  LOW: 'green'
};

export function GrowthPage() {
  const {
    roles,
    selectedRole,
    setSelectedRole,
    gaps,
    roadmap,
    projects,
    outdated,
    job,
    analyzing,
    loading,
    error,
    analyze,
    regenerate
  } = useGrowth();

  const [openGap, setOpenGap] = useState<string | null>(null);

  useEffect(() => {
    if (job?.status === 'COMPLETED') {
      toast.success('Growth analysis complete — view your roadmap and projects');
    } else if (job?.status === 'FAILED') {
      toast.error(job.error ?? 'Growth analysis failed');
    }
  }, [job?.status, job?.error]);

  if (loading) return <PageLoader label="Loading your growth analysis…" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Skill Gap Intelligence</h1>
          <p className="mt-1 text-sm text-slate-400">
            Based on what you have actually demonstrated — what should you learn next?
          </p>
        </div>
        <Link to="/dashboard/growth/roadmap" className="text-xs text-cyan-400 hover:text-cyan-300">
          Your roadmap →
        </Link>
      </header>

      {/* Target role selector (§16) */}
      <Card title="Target role" subtitle="Pick the role you are working toward. DevDNA compares it against your actual evidence.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Target className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              aria-label="Target role"
              className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-9 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
            >
              <option value="">Select a target role…</option>
              {roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          </div>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing || !selectedRole}
            className={`${buttonClasses} px-5`}
          >
            {analyzing ? 'Analyzing…' : 'Analyze Skill Gaps'}
          </button>
        </div>
        {selectedRole && roles.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            {roles.find((r) => r.role === selectedRole)?.description}
          </p>
        )}
      </Card>

      {/* Live progress (§20) */}
      {analyzing && (
        <Card>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{job?.currentStep ?? 'Preparing growth analysis…'}</span>
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

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      {/* Regeneration banner (§28) — never silently destroys the roadmap */}
      {outdated && roadmap && !analyzing && (
        <InlineAlert tone="amber">
          <span className="flex flex-wrap items-center gap-2">
            Your Developer DNA has changed. Your roadmap can be updated.
            <button
              type="button"
              onClick={() => void regenerate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/10"
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              Regenerate Roadmap
            </button>
          </span>
        </InlineAlert>
      )}

      {/* Edge cases (§36) */}
      {!selectedRole && (
        <Card>
          <Compass className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 text-sm text-slate-300">Select a target role to see your skill gaps.</p>
        </Card>
      )}

      {selectedRole && !gaps && !analyzing && !error && (
        <Card>
          <Sparkles className="h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 text-sm text-slate-300">Run Developer DNA analysis first.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            DevDNA builds growth recommendations from your synchronized repositories —
            <Link to="/github" className="mx-1 text-cyan-400 hover:text-cyan-300">
              <Github className="inline h-3 w-3" aria-hidden /> connect GitHub
            </Link>
            and analyze your code, then return here.
          </p>
          <button type="button" onClick={() => void analyze()} className={`${buttonClasses} mt-4 px-5`}>
            Analyze Skill Gaps
          </button>
        </Card>
      )}

      {/* Skill gap overview (§21) */}
      {gaps && (
        <>
          <Card
            title={`Skill gaps — ${gaps.targetRole}`}
            subtitle={`${gaps.gaps.length} gap(s) · strengths: ${gaps.strengths.slice(0, 5).join(', ') || 'none yet'}`}
          >
            {gaps.gaps.length === 0 ? (
              <p className="text-sm text-slate-300">
                No gaps — your demonstrated skills already meet every requirement for this role.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {gaps.gaps.map((gap, i) => {
                  const open = openGap === gap.skill;
                  return (
                    <motion.li
                      key={gap.skill}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/50"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenGap(open ? null : gap.skill)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-800/40"
                      >
                        <span className="w-9 shrink-0 text-base font-bold text-white">{gap.gap}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-200">{gap.skill}</span>
                          <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-800">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                              style={{ width: `${Math.min(100, (gap.gap / Math.max(1, gap.requiredLevel)) * 100)}%` }}
                            />
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            Current: {gap.currentScore ?? 'insufficient evidence'} · Target: {gap.requiredLevel}
                          </span>
                        </span>
                        <Badge tone={PRIORITY_TONES[gap.priority]}>{gap.priority}</Badge>
                        <Badge tone={KIND_TONES[gap.kind]}>{KIND_LABELS[gap.kind]}</Badge>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {open && (
                        <div className="border-t border-slate-800/80 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Why this gap?</p>
                          <ul className="mt-1.5 space-y-1.5">
                            {gap.evidence.map((e, j) => (
                              <li key={j} className="text-xs leading-relaxed text-slate-400">
                                · {e}
                              </li>
                            ))}
                            {gap.evidence.length === 0 && (
                              <li className="text-xs text-slate-500">Insufficient evidence recorded.</li>
                            )}
                          </ul>
                          {gap.dependencies.length > 0 && (
                            <p className="mt-2 text-[11px] text-slate-500">
                              Builds on: {gap.dependencies.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Quick links */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Your roadmap" subtitle={roadmap ? `v${roadmap.version} · ${roadmap.phases.length} phases · ${roadmap.estimatedDuration}` : 'Generated from your gaps'}>
              <Link
                to="/dashboard/growth/roadmap"
                className={`${buttonClasses} inline-flex items-center gap-2 px-4`}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                View roadmap
              </Link>
            </Card>
            <Card
              title="Recommended projects"
              subtitle={projects.length ? `${projects.length} project(s) targeting your gaps` : 'Projects matched to your gaps'}
            >
              <Link
                to="/dashboard/growth/projects"
                className={`${buttonClasses} inline-flex items-center gap-2 px-4`}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                View projects
              </Link>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
