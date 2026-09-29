/** Rendered once above the app — displays the toast stack (§21.6). */
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { useToastStore, type ToastTone } from '../store/toastStore';

const ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
};

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed right-4 top-20 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs shadow-lg shadow-black/30 backdrop-blur ${TONE_STYLES[t.tone]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1 leading-relaxed">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-60 transition hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
