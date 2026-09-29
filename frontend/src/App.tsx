import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute, RedirectIfAuthenticated } from './components/ProtectedRoute';
import { ToastViewport } from './components/ToastViewport';
import { RootLayout } from './layouts/RootLayout';
import { AnalystPage } from './pages/AnalystPage';
import { DashboardPage } from './pages/DashboardPage';
import { DnaPage } from './pages/DnaPage';
import { DnaRepositoriesPage } from './pages/DnaRepositoriesPage';
import { DnaRepositoryDetailPage } from './pages/DnaRepositoryDetailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { GitHubPage } from './pages/GitHubPage';
import { GrowthPage } from './pages/GrowthPage';
import { GrowthProjectDetailPage } from './pages/GrowthProjectDetailPage';
import { GrowthProjectsPage } from './pages/GrowthProjectsPage';
import { GrowthRoadmapPage } from './pages/GrowthRoadmapPage';
import { GitHubRepositoriesPage } from './pages/GitHubRepositoriesPage';
import { GitHubRepositoryDetailPage } from './pages/GitHubRepositoryDetailPage';
import { HomePage } from './pages/HomePage';
import { InterviewPage } from './pages/InterviewPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusPage } from './pages/StatusPage';
import { useAuthStore } from './store/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000
    }
  }
});

/**
 * Probes the session once on boot so protected routes know whether an
 * HTTP-only cookie session exists (authentication persistence, §23).
 */
function useSessionBootstrap(): void {
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser);
  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);
}

/** Route tree, factored out so tests can wrap it in a MemoryRouter. */
export function AppRoutes() {
  useSessionBootstrap();

  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/analyst"
          element={
            <ProtectedRoute>
              <AnalystPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/interview"
          element={
            <ProtectedRoute>
              <InterviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/github"
          element={
            <ProtectedRoute>
              <GitHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/github/repositories"
          element={
            <ProtectedRoute>
              <GitHubRepositoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/dna"
          element={
            <ProtectedRoute>
              <DnaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/repositories"
          element={
            <ProtectedRoute>
              <DnaRepositoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/repositories/:id"
          element={
            <ProtectedRoute>
              <DnaRepositoryDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/growth"
          element={
            <ProtectedRoute>
              <GrowthPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/growth/roadmap"
          element={
            <ProtectedRoute>
              <GrowthRoadmapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/growth/projects"
          element={
            <ProtectedRoute>
              <GrowthProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/growth/projects/:id"
          element={
            <ProtectedRoute>
              <GrowthProjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/github/repositories/:id"
          element={
            <ProtectedRoute>
              <GitHubRepositoryDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
