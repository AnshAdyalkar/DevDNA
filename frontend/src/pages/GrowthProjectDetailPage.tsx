/**
 * /dashboard/growth/projects/:id — Project detail (§25).
 * Overview, why this project, skills developed, gaps addressed, recommended
 * architecture, technology stack and skill-mapped milestones (§15).
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Flag, Network, Target } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useGrowth } from '../hooks/useGrowth';
import { fetchProject, type ProjectRecommendation } from '../services/growthService';

const DIFFICULTY_TONES = {
  Beginner: 'green',
  Intermediate: 'cyan',
  Advanced: 'red'
} as const;

export function GrowthProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { projects, loading: growthLoading } = useGrowth();
  const [project, setProject] = useState<ProjectRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the list load to settle first: an id cached in the list lets
    // us render instantly; otherwise fetch the single project directly.
    let cancelled = false;
    if (growthLoading) return () => undefined;
    const cached = projects.find((p) => p._id === id);
    if (cached && !cancelled) {
      setProject(cached);
      setLoading(false);
      return () => undefined;
    }
    if (id) {
      fetchProject(id)
        .then((p) => {
          if (!cancelled) setProject(p);
        })
        .catch(() => {
          if (!cancelled) setError('Project recommendation not found');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (!cancelled) {
      setError('Project recommendation not found');
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [id, projects, growthLoading]);

  if (loading || growthLoading) return <PageLoader label="Loading project…" />;

  if (error || !project) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <InlineAlert tone="error">{error ?? 'Project recommendation not found'}</InlineAlert>
        <Link to="/dashboard/growth/projects" className={buttonClasses}>
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/dashboard/growth/projects"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          All projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">{project.title}</h1>
          <Badge tone={DIFFICULTY_TONES[project.difficulty]}>{project.difficulty}</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {project.estimatedDuration} · target role: {project.targetRole}
        </p>
      </header>

      <Card title="Overview" subtitle="What you will build and why it fits your trajectory.">
        <p className="text-sm leading-relaxed text-slate-300">{project.description}</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Skills developed" subtitle="Capabilities this project demonstrably exercises.">
          <div className="flex flex-wrap gap-2">
            {project.skillsDeveloped.map((s) => (
              <Badge key={s} tone="cyan">
                {s}
              </Badge>
            ))}
          </div>
        </Card>
        <Card title="Skill gaps addressed" subtitle="Your actual gaps this project closes (§11).">
          <ul className="space-y-1.5">
            {project.gapsAddressed.length === 0 ? (
              <li className="text-xs text-slate-500">No direct gap overlap — this project reinforces your strengths.</li>
            ) : (
              project.gapsAddressed.map((g) => (
                <li key={g} className="flex items-center gap-2 text-xs text-slate-300">
                  <Target className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                  {g}
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {project.architecture && (
        <Card title="Recommended architecture" subtitle="A concrete starting point you can adapt.">
          <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs leading-relaxed text-cyan-200">
            <Network className="mb-2 h-4 w-4 text-slate-500" aria-hidden />
            {project.architecture}
          </pre>
        </Card>
      )}

      <Card title="Milestones" subtitle="Each milestone maps to skills, so completing it grows your DNA.">
        <ol className="space-y-3">
          {project.milestones.map((m, i) => (
            <motion.li
              key={m.order}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Flag className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
                  Milestone {m.order}: {m.title}
                </p>
                <Badge tone="slate">{m.estimatedDuration}</Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{m.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Skills:</span>
                {m.skills.map((s) => (
                  <Badge key={s} tone="slate">
                    {s}
                  </Badge>
                ))}
              </div>
            </motion.li>
          ))}
        </ol>
      </Card>

      {project.technologies.length > 0 && (
        <Card title="Technology stack" subtitle="Core stack plus the gap-driven additions.">
          <div className="flex flex-wrap gap-2">
            {project.technologies.map((t) => (
              <span key={t} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300">
                {t}
              </span>
            ))}
          </div>
        </Card>
      )}

      {project.prerequisites.length > 0 && (
        <Card title="Prerequisites" subtitle="Technologies to be comfortable with before starting.">
          <div className="flex flex-wrap gap-2">
            {project.prerequisites.map((t) => (
              <Badge key={t} tone="amber">
                {t}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
