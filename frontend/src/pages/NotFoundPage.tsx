import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="font-mono text-6xl font-bold text-slate-800">404</p>
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <p className="text-sm text-slate-400">The page you are looking for does not exist.</p>
      <Link
        to="/"
        className="rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/10"
      >
        Back to home
      </Link>
    </div>
  );
}
