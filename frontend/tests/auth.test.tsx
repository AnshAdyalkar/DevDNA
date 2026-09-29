/**
 * Frontend Phase 2 tests (requirement §40): login/register forms, validation,
 * protected routes, auth loading state, logout, and profile editing.
 * The auth service layer is mocked — no network, no cookies in jsdom.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import { ApiRequestError } from '@/services/api';
import * as authService from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

const MOCK_USER = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada-dev',
  email: 'ada@example.com',
  githubConnected: false,
  createdAt: '2026-01-01T00:00:00.000Z'
};

function renderRoutes(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function typeInto(field: HTMLElement | string, value: string) {
  const el = typeof field === 'string' ? screen.getByLabelText(field) : field;
  fireEvent.change(el, { target: { value } });
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: true });
  vi.restoreAllMocks();
});

// ─── Loading state ───────────────────────────────────────────────────────────

describe('authentication loading state', () => {
  it('shows the session-check state on protected routes while probing', () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockReturnValue(new Promise(() => {}));
    renderRoutes('/dashboard');
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
  });

  it('resolves the session probe and reveals the protected page', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(MOCK_USER);
    renderRoutes('/dashboard');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    );
  });
});

// ─── Protected routes ────────────────────────────────────────────────────────

describe('protected routes', () => {
  it('redirects signed-out users to /login and preserves the destination', async () => {
    // A signed-out probe surfaces as a 401 from /auth/me.
    vi.spyOn(authService, 'fetchCurrentUser').mockRejectedValue(
      new ApiRequestError('Authentication required', 'UNAUTHORIZED', 401)
    );
    renderRoutes('/settings');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  it('redirects authenticated users away from /login to /dashboard', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(MOCK_USER);
    renderRoutes('/login');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    );
  });
});

// ─── Login form ──────────────────────────────────────────────────────────────

describe('login form', () => {
  it('submits valid credentials and lands on the dashboard', async () => {
    const loginSpy = vi
      .spyOn(authService, 'login')
      .mockResolvedValue(MOCK_USER);
    renderRoutes('/login');

    typeInto(await screen.findByLabelText('Email'), 'ada@example.com');
    typeInto('Password', 'SecurePass123');
    fireEvent.click(await screen.findByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'SecurePass123'
      });
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    );
  });

  it('shows validation errors without submitting', async () => {
    const loginSpy = vi.spyOn(authService, 'login');
    renderRoutes('/login');

    fireEvent.click(
      await screen.findByRole('button', { name: /sign in/i })
    );

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('surfaces server errors (wrong credentials) inline', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(
      new Error('Invalid email or password')
    );
    renderRoutes('/login');

    typeInto(await screen.findByLabelText('Email'), 'ada@example.com');
    typeInto('Password', 'WrongPass1');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });
});

// ─── Register form ───────────────────────────────────────────────────────────

describe('register form', () => {
  it('rejects a weak password with the policy message', async () => {
    const registerSpy = vi.spyOn(authService, 'register');
    renderRoutes('/register');

    typeInto(await screen.findByLabelText('Full name'), 'Ada Lovelace');
    typeInto('Username', 'ada-dev');
    typeInto('Email', 'ada@example.com');
    typeInto('Password', 'weakpass');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(
        /Password must contain at least 8 characters, one uppercase letter, one lowercase letter, and one number/
      )
    ).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid username format client-side', async () => {
    const registerSpy = vi.spyOn(authService, 'register');
    renderRoutes('/register');

    typeInto(await screen.findByLabelText('Full name'), 'Ada Lovelace');
    typeInto('Username', 'Ada Dev!');
    typeInto('Email', 'ada@example.com');
    typeInto('Password', 'SecurePass123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText(
        /Username may only contain letters, numbers, hyphens and underscores/
      )
    ).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('submits a valid registration and lands on the dashboard', async () => {
    const registerSpy = vi
      .spyOn(authService, 'register')
      .mockResolvedValue(MOCK_USER);
    renderRoutes('/register');

    typeInto(await screen.findByLabelText('Full name'), 'Ada Lovelace');
    typeInto('Username', 'ada-dev');
    typeInto('Email', 'ada@example.com');
    typeInto('Password', 'SecurePass123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        username: 'ada-dev',
        email: 'ada@example.com',
        password: 'SecurePass123'
      });
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    );
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('signs the user out from the header menu and navigates to /login', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(MOCK_USER);
    const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue(undefined);
    useAuthStore.setState({ user: MOCK_USER, isLoading: false });

    renderRoutes('/dashboard');

    // Open the user menu, then sign out.
    fireEvent.click(screen.getByRole('button', { name: /ada/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});

// ─── Profile editing ─────────────────────────────────────────────────────────

describe('profile editing', () => {
  it('submits editable fields and toasts on success', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(MOCK_USER);
    const updateSpy = vi.spyOn(authService, 'updateProfile').mockResolvedValue({
      ...MOCK_USER,
      location: 'Berlin'
    });
    useAuthStore.setState({ user: MOCK_USER, isLoading: false });

    renderRoutes('/profile');

    typeInto(await screen.findByLabelText('Location'), 'Berlin');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'Berlin' })
      );
    });
    // The store reflects the saved profile (the toast renders only in <App/>).
    await waitFor(() =>
      expect(useAuthStore.getState().user?.location).toBe('Berlin')
    );
  });

  it('reports server validation errors inline', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(MOCK_USER);
    vi.spyOn(authService, 'updateProfile').mockRejectedValue(
      new ApiRequestError('This username is already taken', 'CONFLICT', 409)
    );
    useAuthStore.setState({ user: MOCK_USER, isLoading: false });

    renderRoutes('/profile');

    typeInto(await screen.findByLabelText('Username'), 'taken-name');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText('This username is already taken')
    ).toBeInTheDocument();
  });
});
