import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';

// Network is never available in unit tests — the UI must degrade gracefully.
vi.mock('@/services/statusService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/statusService')>();
  return {
    ...actual,
    fetchSystemStatus: vi.fn(() => Promise.reject(new Error('offline')))
  };
});

function renderWithRouter(initialPath = '/') {
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

describe('App routing', () => {
  it('renders the landing page with tagline and feature grid', async () => {
    renderWithRouter('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/developer DNA/i);
    expect(screen.getByText('Developer DNA')).toBeInTheDocument();
    expect(screen.getByText('Learning Roadmap')).toBeInTheDocument();
  });

  it('shows the sample-visualization disclaimer (no fake real data)', async () => {
    renderWithRouter('/');
    expect(screen.getByText(/Sample visualization — not real data/i)).toBeInTheDocument();
  });

  it('renders the status page which degrades to an error state when API is down', async () => {
    renderWithRouter('/status');

    expect(screen.getByRole('heading', { level: 1, name: 'System Status' })).toBeInTheDocument();
    // Query retries once (~1s backoff) before surfacing the error state
    await waitFor(
      () => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });

  it('renders the 404 page for unknown routes', () => {
    renderWithRouter('/nope/nope');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});
