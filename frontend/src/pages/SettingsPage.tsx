/**
 * /settings — Security (password change), Sessions, GitHub status, and
 * Data & Privacy (account deletion) (§25–§29, §20).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Laptop, Link2, ShieldAlert, Trash2 } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import {
  buttonClasses,
  Field,
  InlineAlert,
  inputClasses
} from '../components/ui/FormFeedback';
import { zodResolver } from '../lib/zodResolver';
import { changePasswordSchema, type ChangePasswordValues } from '../lib/authSchemas';
import { Link } from 'react-router-dom';
import { useGitHubSync } from '../hooks/useGitHubSync';
import { ApiRequestError } from '../services/api';
import {
  changePassword,
  fetchSessions,
  logoutAll
} from '../services/authService';
import type { SessionInfo } from '../../../shared/types';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

/** Best-effort device label from the session's user-agent. */
function deviceLabel(ua: string): string {
  if (/mobile/i.test(ua)) return 'Mobile browser';
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  if (/node|axios|curl|python/i.test(ua)) return 'API client';
  return 'Unknown device';
}

// ─── Password change ─────────────────────────────────────────────────────────

function PasswordCard() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register: registerField,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      reset();
      toast.success('Password changed — please sign in again');
      // Backend revoked every session; boot the user to a clean login form.
      useAuthStore.getState().clearUser();
      window.location.assign('/login');
    } catch (error) {
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : 'Unable to change your password. Please try again.'
      );
    }
  });

  return (
    <Card title="Password" subtitle="Changing your password signs you out everywhere.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}
        <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className={inputClasses}
            {...registerField('currentPassword')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className={inputClasses}
              {...registerField('newPassword')}
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={inputClasses}
              {...registerField('confirmPassword')}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={isSubmitting} className={buttonClasses}>
            {isSubmitting ? 'Updating…' : 'Change password'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function SessionsCard() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRevokeAll = async () => {
    setRevoking(true);
    try {
      await logoutAll();
      // Every session — including this one — is now revoked.
      useAuthStore.getState().clearUser();
      window.location.assign('/login');
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError ? error.message : 'Unable to sign out everywhere.'
      );
      setRevoking(false);
    }
  };

  return (
    <Card title="Active sessions" subtitle="Devices currently signed in to your account.">
      {sessions === null ? (
        <p className="text-xs text-slate-500">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-slate-500">No active sessions.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Laptop className="h-4 w-4 text-slate-500" aria-hidden />
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {deviceLabel(s.userAgent)}
                    {s.current && (
                      <span className="ml-2">
                        <Badge tone="green">This device</Badge>
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Last active {formatWhen(s.lastUsedAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onRevokeAll}
          disabled={revoking}
          className="rounded-xl border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {revoking ? 'Signing out…' : 'Sign out everywhere'}
        </button>
      </div>
    </Card>
  );
}

// ─── GitHub (Phase 3 placeholder) ────────────────────────────────────────────

function GitHubCard() {
  const { status, loading, connect } = useGitHubSync();
  const connected = status?.connected ?? false;
  const account = status?.account;

  if (loading) {
    return (
      <Card title="GitHub" subtitle="Checking connection…">
        <p className="text-xs text-slate-500">Loading…</p>
      </Card>
    );
  }

  return (
    <Card title="GitHub" subtitle="Connect your repositories to unlock DNA analysis.">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link2 className="h-4 w-4 text-slate-500" aria-hidden />
          <div>
            <p className="text-xs font-medium text-slate-300">
              {connected ? `Connected as @${account?.login}` : 'Not connected'}
            </p>
            {connected && account?.lastSyncedAt && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Last synced {new Date(account.lastSyncedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {connected ? (
          <Link to="/github" className="text-xs text-cyan-400 hover:text-cyan-300">
            Manage →
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90"
          >
            Connect GitHub
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Data & privacy ──────────────────────────────────────────────────────────

function DangerZoneCard() {
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const { deleteAccount: deleteMe } = useAuthStore.getState();
      await deleteMe();
      toast.success('Your account has been deleted');
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Unable to delete your account.'
      );
      setDeleting(false);
    }
  };

  const armed = confirmText.trim().toLowerCase() === 'delete';

  return (
    <Card title="Delete account" subtitle="Permanently remove your account and sessions.">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
          <p className="text-xs leading-relaxed text-red-200">
            This deletes your profile, sessions, and all DevDNA data associated with your
            account. This action is permanent and cannot be undone.
          </p>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='Type "delete" to confirm'
          aria-label='Type "delete" to confirm account deletion'
          className={`${inputClasses} sm:max-w-xs`}
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={!armed || deleting}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Account settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as {user.email} — manage security, sessions, and data.
        </p>
      </header>

      <PasswordCard />
      <SessionsCard />
      <GitHubCard />
      <DangerZoneCard />

      <p className="flex items-center gap-2 text-[11px] text-slate-600">
        <KeyRound className="h-3 w-3" aria-hidden />
        Passwords are hashed with bcrypt and never stored in plain text.
      </p>
    </div>
  );
}
