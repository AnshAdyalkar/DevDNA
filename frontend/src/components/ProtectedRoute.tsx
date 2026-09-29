/**
 * Route guards (§20, §24).
 *  - ProtectedRoute: requires a session; bounces to /login preserving the
 *    intended location so login can redirect back.
 *  - RedirectIfAuthenticated: keeps signed-in users away from /login, etc.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '../store/authStore';
import { PageLoader } from './ui/FormFeedback';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return <PageLoader label="Checking your session…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return <PageLoader label="Checking your session…" />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
