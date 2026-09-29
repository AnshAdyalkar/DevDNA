import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Dna, Github, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';

import { applyTheme, useUiStore, type Theme } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

const THEME_ORDER: Theme[] = ['light', 'dark', 'system'];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  const Icon = THEME_ICON[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${theme} (switch to ${next})`}
      title={`Theme: ${theme}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-400 transition hover:border-cyan-500/50 hover:text-cyan-300"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Compact avatar bubble showing the user's initials. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-indigo-500/30 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-500/40">
      {initials || 'U'}
    </span>
  );
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
      toast.success('Signed out');
    } catch {
      toast.error('Sign out failed on the server — session cleared locally');
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-transparent px-1.5 py-1 transition hover:border-slate-700"
      >
        <Avatar name={user.name} />
        <span className="hidden text-sm text-slate-200 sm:block">{user.name.split(' ')[0]}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden />
      </button>

      {open && (
        <>
          {/* Click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl shadow-black/40"
          >
            <div className="border-b border-slate-800 px-4 py-3">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
            <div className="p-1.5">
              {[
                { to: '/dashboard', label: 'Dashboard' },
                { to: '/dashboard/dna', label: 'Developer DNA' },
                { to: '/dashboard/growth', label: 'Skill Gaps & Growth' },
                { to: '/dashboard/analyst', label: 'AI Analyst' },
                { to: '/dashboard/interview', label: 'AI Interviewer' },
                { to: '/github', label: 'GitHub' },
                { to: '/profile', label: 'Your profile' },
                { to: '/settings', label: 'Settings' }
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function RootLayout() {
  const theme = useUiStore((s) => s.theme);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 ring-1 ring-cyan-500/30">
              <Dna className="h-5 w-5 text-cyan-400" />
            </span>
            <span className="text-lg tracking-tight text-white">
              Dev<span className="text-cyan-400">DNA</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            {user && (
              <>
                <Link
                  to="/dashboard"
                  className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-300 sm:flex"
                >
                  Dashboard
                </Link>
                <Link
                  to="/github"
                  className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-300 sm:flex"
                >
                  <Github className="h-4 w-4" aria-hidden />
                  GitHub
                </Link>
              </>
            )}
            <Link
              to="/status"
              className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-300 sm:flex"
            >
              <Activity className="h-4 w-4" />
              System
            </Link>
            <ThemeToggle />
            {isLoading ? null : user ? (
              <UserMenu />
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:text-cyan-300"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                >
                  <UserRound className="h-4 w-4" aria-hidden />
                  Get started
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800/70 py-6 text-center text-xs text-slate-500">
        DevDNA — Your code. Your skills. Your developer DNA.
      </footer>
    </div>
  );
}
