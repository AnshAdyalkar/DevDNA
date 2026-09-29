import { RefreshCw } from 'lucide-react';

import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { ErrorState, Spinner } from './ui/Loading';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { toApiError } from '../services/api';

function tone(status: string) {
  if (status === 'up') return 'green' as const;
  if (status === 'down') return 'red' as const;
  return 'amber' as const;
}

const LABELS: Record<string, string> = {
  api: 'Node.js API',
  database: 'MongoDB',
  pythonService: 'Python Intelligence'
};

export function StatusCard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useSystemStatus();

  if (isLoading) {
    return (
      <Card title="System Status">
        <div className="flex items-center gap-3 py-6 text-sm text-slate-400">
          <Spinner /> Checking services…
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card title="System Status">
        <ErrorState message={toApiError(error).message} onRetry={() => void refetch()} />
      </Card>
    );
  }

  const services = [
    { key: 'api', ...data.services.api },
    { key: 'database', ...data.services.database },
    { key: 'pythonService', ...data.services.pythonService }
  ] as Array<{ key: string; status: string; url?: string; version?: string }>;

  return (
    <Card
      title="System Status"
      subtitle={`Checked ${new Date(data.timestamp).toLocaleTimeString()}`}
      className="dna-grid-bg"
    >
      <ul className="space-y-3">
        {services.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  s.status === 'up'
                    ? 'bg-emerald-400'
                    : s.status === 'down'
                      ? 'bg-red-400'
                      : 'bg-amber-400'
                }`}
              />
              {LABELS[s.key] ?? s.key}
            </span>
            <span className="flex items-center gap-2">
              {s.key === 'api' && s.version && (
                <span className="text-xs text-slate-500">v{s.version}</span>
              )}
              <Badge tone={tone(s.status)}>{s.status}</Badge>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void refetch()}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50"
        disabled={isFetching}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </Card>
  );
}
