export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400 ${className}`}
    />
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center"
    >
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
