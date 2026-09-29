import type { ReactNode } from 'react';

type Tone = 'green' | 'red' | 'amber' | 'slate' | 'cyan';

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  red: 'bg-red-500/10 text-red-300 ring-red-500/30',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  slate: 'bg-slate-500/10 text-slate-300 ring-slate-500/30',
  cyan: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30'
};

export function Badge({
  children,
  tone = 'slate'
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
