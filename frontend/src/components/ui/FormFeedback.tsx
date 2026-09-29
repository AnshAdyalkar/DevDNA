/** Convenience UI components for forms and empty states. */
import type { ReactNode } from 'react';

import { Spinner } from './Loading';

const TONES = {
  error: 'border-red-500/20 bg-red-500/5 text-red-300',
  info: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-200',
  amber: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
  neutral: 'border-slate-700/60 bg-slate-900/60 text-slate-400'
} as const;

export function InlineAlert({
  tone = 'neutral',
  children
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <div role="alert" className={`rounded-xl border px-3.5 py-2.5 text-xs ${TONES[tone]}`}>
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

/** Labeled input row with error/hint text, matching the DevDNA form language. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClasses =
  'w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 transition focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/40';

export const buttonClasses =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/** Full-area loading placeholder used by protected pages while auth boots. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <Spinner className="h-6 w-6" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
