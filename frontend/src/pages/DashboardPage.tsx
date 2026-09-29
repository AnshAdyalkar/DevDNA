/** /dashboard — signed-in landing page (§43; DNA scores arrive in Phase 6). */
import { Link } from 'react-router-dom';
import { Brain, CalendarDays, Dna, Github, GraduationCap, MapPin, Sparkles } from 'lucide-react';

import { AIInsightCards } from '../components/AIInsightCards';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useAuthStore } from '../store/authStore';

const ROADMAPS = [
  {
    title: 'Connect GitHub',
    text: 'Link your account so DevDNA can analyze your repositories.',
    phase: 'Phase 3',
    icon: Github
  },
  {
    title: 'Analyze your code',
    text: 'Language, framework and DevOps signals extracted from real commits.',
    phase: 'Phases 4–5',
    icon: Sparkles
  },
  {
    title: 'View your Developer DNA',
    text: 'A multi-dimensional profile with strengths, gaps and a roadmap.',
    phase: 'Phase 6',
    icon: GraduationCap
  }
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="space-y-8">
      <header className="dna-grid-bg flex flex-col gap-6 rounded-3xl border border-slate-800/60 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge tone="cyan">Phase 2 — Account ready</Badge>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Welcome back, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Your account is live. GitHub analysis unlocks in Phase 3.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/dashboard/dna"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Analyze My Developer DNA
          </Link>
          <Link
            to="/dashboard/analyst"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 px-4 py-2.5 text-sm font-medium text-cyan-300 transition hover:border-cyan-500/60 hover:bg-cyan-500/10"
          >
            <Dna className="h-4 w-4" aria-hidden />
            Ask AI Analyst
          </Link>
          <Link
            to="/dashboard/interview"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <Brain className="h-4 w-4" aria-hidden />
            Practice Interview
          </Link>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {ROADMAPS.map((step) => (
          <Card key={step.title}>
            <div className="flex items-center justify-between">
              <step.icon className="h-6 w-6 text-cyan-400" aria-hidden />
              <Badge>{step.phase}</Badge>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{step.text}</p>
          </Card>
        ))}
      </div>

      {/* Phase 6 — AI insight cards (hidden entirely when AI is unavailable) */}
      <AIInsightCards />

      <Card title="At a glance" subtitle="Details from your DevDNA account.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
            <div>
              <dt className="text-xs text-slate-500">Member since</dt>
              <dd className="text-slate-200">{formatDate(user.createdAt)}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Github className="h-4 w-4 text-slate-500" aria-hidden />
            <div>
              <dt className="text-xs text-slate-500">GitHub</dt>
              <dd className="text-slate-200">
                {user.githubConnected ? user.username : 'Not connected yet'}
              </dd>
            </div>
          </div>
          {user.location && (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 text-slate-500" aria-hidden />
              <div>
                <dt className="text-xs text-slate-500">Location</dt>
                <dd className="text-slate-200">{user.location}</dd>
              </div>
            </div>
          )}
          {user.targetRole && (
            <div className="flex items-center gap-2.5">
              <GraduationCap className="h-4 w-4 text-slate-500" aria-hidden />
              <div>
                <dt className="text-xs text-slate-500">Target role</dt>
                <dd className="text-slate-200">{user.targetRole}</dd>
              </div>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}
