import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  GitBranch,
  GraduationCap,
  MessagesSquare,
  Radar
} from 'lucide-react';

import { ScoreRing } from '../components/ScoreRing';
import { StatusCard } from '../components/StatusCard';
import { Badge } from '../components/ui/Badge';

const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'Developer DNA',
    text: 'A multi-dimensional profile computed from your actual repositories — every score backed by evidence.'
  },
  {
    icon: BarChart3,
    title: 'Skill Intelligence',
    text: 'Language, framework, database, DevOps and testing scores derived from measurable signals.'
  },
  {
    icon: Radar,
    title: 'Skill Gap Detection',
    text: 'Compare your current skills against your target role and see exactly what is missing.'
  },
  {
    icon: GraduationCap,
    title: 'Learning Roadmap',
    text: 'A personalized, stage-by-stage roadmap generated from your detected gaps.'
  },
  {
    icon: MessagesSquare,
    title: 'AI Interview Prep',
    text: 'Interview questions generated from your real projects and technology stack.'
  },
  {
    icon: GitBranch,
    title: 'Repository Intelligence',
    text: 'Health, complexity, documentation and testing scores for every repository.'
  }
];

const PIPELINE = [
  'Connect GitHub',
  'Analyze Profile',
  'View Developer DNA',
  'Understand Strengths',
  'Discover Skill Gaps',
  'Get Personalized Roadmap',
  'Build Recommended Project',
  'Take AI Interview',
  'Track Improvement'
];

export function HomePage() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="dna-grid-bg flex flex-col items-center gap-10 rounded-3xl border border-slate-800/60 px-6 py-16 text-center lg:flex-row lg:text-left">
        <div className="flex-1 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center lg:justify-start"
          >
            <Badge tone="cyan">Phase 1 — Foundation is live</Badge>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Your code. Your skills.{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Your developer DNA.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-xl text-base leading-relaxed text-slate-400"
          >
            DevDNA analyzes your GitHub repositories, commits, and architecture to build an
            evidence-backed developer profile — then turns it into skill gaps, a learning
            roadmap, and interview preparation.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <Link
              to="/status"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90"
            >
              Check Platform Status
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-slate-500">
              GitHub sync &amp; analysis arrive in Phases 3–6
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="shrink-0"
        >
          {/* Illustrative preview value — real DNA scores arrive in Phase 6 */}
          <div className="flex flex-col items-center gap-2">
            <ScoreRing value={78} label="Preview" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Sample visualization — not real data
            </span>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
          One platform, the full growth loop
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-400">
          Every feature connects to the next — from raw GitHub data to measurable developer
          growth.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 transition hover:border-cyan-500/40"
            >
              <f.icon className="h-6 w-6 text-cyan-400" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-8">
        <h2 className="text-center text-xl font-bold text-white">
          From GitHub data to developer growth
        </h2>
        <ol className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-xs">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 font-medium text-slate-300">
                {step}
              </span>
              {i < PIPELINE.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-cyan-500/60" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Live system status */}
      <section className="mx-auto max-w-md">
        <StatusCard />
      </section>
    </div>
  );
}
