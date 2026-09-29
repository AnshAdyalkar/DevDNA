/**
 * /dashboard/growth/projects — Project recommendations (§24).
 * Each card shows difficulty, duration, skills developed and which of the
 * user's actual gaps the project addresses.
 */
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Target, Wrench } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useGrowth } from '../hooks/useGrowth';
import type { ProjectRecommendation } from '../services/growthService';

const DIFFICULTY_TONES = {
  Beginner: 'green',
  Intermediate: 'cyan',
  Advanced: 'red'
} as const;

function ProjectCard({ project }: { project: ProjectRecommendation }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">{project.title}</h2>
          <Badge tone={DIFFICULTY_TONES[project.difficulty]}>{project.difficulty}</Badge>
        </div>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{project.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.technologies.slice(0, 6).map((t) => (
            <span key={t} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-300">
              {t}
            </span>
          ))}
        </div>

        <dl className="mt-3 space-y-1 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3 w-3" aria-hidden />
            <span>Duration: {project.estimatedDuration}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3" aria-hidden />
            <span>
              Addresses {project.gapsAddressed.length} current skill gap
              {project.gapsAddressed.length === 1 ? '' : 's'}
              {project.gapsAddressed.length > 0 && `: ${project.gapsAddressed.join(', ')}`}
            </span>
          </div>
        </dl>

        <Link
          to={`/dashboard/growth/projects/${project._id}`}
          className={`${buttonClasses} mt-4 inline-flex items-center justify-center gap-1.5 px-4`}
        >
          View Project
        </Link>
      </Card>
    </motion.div>
  );
}

export function GrowthProjectsPage() {
  const { projects, loading, error, analyzing } = useGrowth();

  if (loading) return <PageLoader label="Loading project recommendations…" />;

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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Recommended Projects</h1>
        <p className="mt-1 text-sm text-slate-400">
          Matched to your current skills, your actual gaps and your target role.
        </p>
      </header>

      {projects.length === 0 ? (
        <Card className="mx-auto max-w-xl text-center">
          <h2 className="text-lg font-semibold text-white">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
            Run the growth analysis and DevDNA will recommend projects that specifically
            address your skill gaps.
            {analyzing ? ' Analysis is running…' : ''}
          </p>
          <Link to="/dashboard/growth" className={`${buttonClasses} mt-5 inline-block px-5`}>
            Go to growth analysis
          </Link>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p._id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
