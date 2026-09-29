import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/** Glassy card used across the dashboard. */
export function Card({ title, subtitle, children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg shadow-black/20 backdrop-blur ${className}`}
    >
      {(title || subtitle) && (
        <header className="mb-4">
          {title && <h3 className="text-sm font-semibold text-slate-200">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
