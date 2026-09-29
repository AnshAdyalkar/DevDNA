import { StatusCard } from '../components/StatusCard';

/** System status page — live health of every DevDNA service. */
export function StatusPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">System Status</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live health of the API gateway, MongoDB, and the Python intelligence service.
          Data refreshes automatically every 30 seconds.
        </p>
      </header>
      <StatusCard />
    </div>
  );
}
