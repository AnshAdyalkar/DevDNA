/**
 * Shared split-screen shell for authentication pages (§43):
 * product messaging on the left, the form on the right.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Dna, GitBranch, Radar, ShieldCheck } from 'lucide-react';

const POINTS = [
  {
    icon: GitBranch,
    title: 'Evidence-backed profile',
    text: 'Scores computed from your real repositories — not self-reported buzzwords.'
  },
  {
    icon: Radar,
    title: 'Skill gap detection',
    text: 'See exactly what separates you from your target role.'
  },
  {
    icon: ShieldCheck,
    title: 'Secure by design',
    text: 'HTTP-only session cookies, hashed passwords, rotating refresh tokens.'
  }
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dna-grid-bg mx-auto grid max-w-5xl gap-10 rounded-3xl border border-slate-800/60 p-6 sm:p-10 lg:grid-cols-2 lg:gap-16">
      {/* Product narrative — communicates the concept (§43) */}
      <aside className="hidden flex-col justify-between lg:flex">
        <div>
          <Link to="/" className="flex items-center gap-2.5 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 ring-1 ring-cyan-500/30">
              <Dna className="h-5 w-5 text-cyan-400" />
            </span>
            <span className="text-lg tracking-tight text-white">
              Dev<span className="text-cyan-400">DNA</span>
            </span>
          </Link>
          <p className="mt-8 text-2xl font-bold leading-snug tracking-tight text-white">
            Understand your code.
            <br />
            Discover your strengths.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Build your next skill.
            </span>
          </p>
        </div>
        <ul className="mt-10 space-y-5">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-slate-200">{p.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* Form panel */}
      <div className="flex flex-col justify-center">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
        </header>
        {children}
        {footer && <div className="mt-6 text-center text-xs text-slate-400">{footer}</div>}
      </div>
    </div>
  );
}
