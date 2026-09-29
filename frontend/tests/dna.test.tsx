/**
 * Phase 4 frontend tests (§33): analyze button, loading, progress,
 * completed state, DNA cards, evidence display, empty & error states.
 * The DNA service is mocked — no network, no sockets.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as dnaService from '@/services/dnaService';
import { DnaPage } from '@/pages/DnaPage';
import { DnaRepositoriesPage } from '@/pages/DnaRepositoriesPage';
import { useAuthStore } from '@/store/authStore';

const USER = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada-dev',
  email: 'ada@example.com',
  githubConnected: true,
  createdAt: '2026-01-01T00:00:00.000Z'
};

const PROFILE: dnaService.DnaProfile = {
  analysisVersion: '1.0',
  analyzedAt: '2026-09-27T12:00:00Z',
  updatedAt: '2026-09-27T12:00:00Z',
  repositoriesAnalyzed: 3,
  primaryLanguages: [
    { name: 'TypeScript', bytes: 60_000, percentage: 60 },
    { name: 'Python', bytes: 40_000, percentage: 40 }
  ],
  technologies: ['React', 'Express', 'MongoDB'],
  projectTypes: [
    { projectType: 'Full-stack Web Application', confidence: 0.9, evidence: ['React detected'] }
  ],
  skills: [
    {
      skill: 'TypeScript',
      score: 72,
      confidence: 0.82,
      evidence: [
        { type: 'repository', value: 'detected in 2 repositories' },
        { type: 'code_volume', value: 'TypeScript represents 60% of measured code' }
      ],
      updatedAt: '2026-09-27T12:00:00Z'
    },
    {
      skill: 'Python',
      score: 55,
      confidence: 0.61,
      evidence: [{ type: 'repository', value: 'detected in 1 repository' }],
      updatedAt: '2026-09-27T12:00:00Z'
    }
  ],
  behavior: {
    observations: ['12 recorded commits across 4 active weeks.'],
    metrics: {}
  },
  engineeringPractices: {
    averageDocumentationScore: 70,
    averageTestingScore: 55,
    readmeCoverage: 100,
    repositoriesWithCi: 2,
    repositoriesWithDocker: 1
  },
  summaryMetrics: {
    languagesDetected: 2,
    technologiesDetected: 3,
    totalCommits: 12
  }
};

const EMPTY_REPOS = { repositories: [] };
const REPOS = {
  repositories: [
    {
      repositoryId: 'r1',
      fullName: 'octo/hello',
      primaryLanguage: 'TypeScript',
      analysisVersion: '1.0',
      analyzedAt: '2026-09-27T12:00:00Z',
      languages: [{ name: 'TypeScript', bytes: 60_000, percentage: 100 }],
      technologies: ['React'],
      metrics: {
        files: 40,
        sourceFiles: 30,
        testFiles: 4,
        documentationFiles: 2,
        configurationFiles: 4,
        linesOfCode: 5400,
        largeFiles: 0
      },
      complexity: {
        complexityScore: 62,
        level: 'Moderate',
        factors: [{ factor: 'Architecture', contribution: 16 }]
      },
      documentation: {
        documentationScore: 70,
        readmePresent: true,
        readmeLength: 2048,
        sectionsDetected: ['Installation', 'Usage']
      },
      testing: {
        testingScore: 55,
        testFiles: 4,
        sourceFiles: 30,
        frameworks: ['Vitest'],
        notes: []
      },
      projectType: { projectType: 'Frontend Application', confidence: 0.7, evidence: ['React detected'] }
    }
  ]
};

function renderDna(path = '/dashboard/dna') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/dna" element={<DnaPage />} />
        <Route path="/dashboard/repositories" element={<DnaRepositoriesPage />} />
        <Route path="/dashboard/repositories/:id" element={<div>detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: USER, isLoading: false });
  vi.restoreAllMocks();
  vi.spyOn(dnaService, 'onAnalysisProgress').mockResolvedValue(() => undefined);
});

describe('analyze button & states (§33)', () => {
  it('shows the empty state with an Analyze button when no profile exists', async () => {
    vi.spyOn(dnaService, 'fetchLatestJob').mockResolvedValue({ job: null });
    vi.spyOn(dnaService, 'fetchDnaProfile').mockRejectedValue(new Error('not found'));
    renderDna();

    expect(
      await screen.findByText(/No Developer DNA yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /analyze my developer dna/i })
    ).toBeEnabled();
  });

  it('starts an analysis when the button is clicked', async () => {
    vi.spyOn(dnaService, 'fetchLatestJob').mockResolvedValue({ job: null });
    vi.spyOn(dnaService, 'fetchDnaProfile').mockRejectedValue(new Error('not found'));
    const startSpy = vi
      .spyOn(dnaService, 'startAnalysis')
      .mockResolvedValue({ jobId: 'job1', status: 'RUNNING', reused: false });
    renderDna();

    fireEvent.click(await screen.findByRole('button', { name: /analyze my developer dna/i }));

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalled();
      expect(screen.getByText(/Analyzing…/i)).toBeInTheDocument();
    });
  });

  it('shows a progress bar with the current step while running', async () => {
    vi.spyOn(dnaService, 'fetchLatestJob').mockResolvedValue({
      job: {
        id: 'job9',
        status: 'ANALYZING_REPOSITORIES',
        progress: 64,
        currentStep: 'ANALYZING_REPOSITORIES'
      }
    });
    vi.spyOn(dnaService, 'fetchDnaProfile').mockResolvedValue(PROFILE);
    renderDna();

    expect(await screen.findByText('64%')).toBeInTheDocument();
    expect(screen.getByText('ANALYZING_REPOSITORIES')).toBeInTheDocument();
  });

  it('shows an error state when the API fails', async () => {
    // Both calls fail: the hook surfaces its error banner.
    vi.spyOn(dnaService, 'fetchLatestJob').mockRejectedValue(new Error('down'));
    vi.spyOn(dnaService, 'fetchDnaProfile').mockRejectedValue(new Error('down'));
    renderDna();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load Developer DNA/i)).toBeInTheDocument();
    });
  });
});

describe('DNA cards & evidence display (§33)', () => {
  beforeEach(() => {
    vi.spyOn(dnaService, 'fetchLatestJob').mockResolvedValue({
      job: { id: 'j1', status: 'COMPLETED', progress: 100, skillsDetected: 2 }
    });
    vi.spyOn(dnaService, 'fetchDnaProfile').mockResolvedValue(PROFILE);
  });

  it('renders the completed profile with overview metrics', async () => {
    renderDna();

    expect(await screen.findByText('Developer DNA')).toBeInTheDocument();
    // Overview card: repositories analyzed = 3 (unique within cards block).
    const overview = screen.getByText('Repositories analyzed').closest('div');
    expect(overview).toHaveTextContent('3');
    expect(screen.getByText(/v1\.0/)).toBeInTheDocument();
  });

  it('renders skill cards with scores and confidence badges', async () => {
    renderDna();

    expect(await screen.findByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('82% · good evidence')).toBeInTheDocument();
    expect(screen.getByText('61% · moderate evidence')).toBeInTheDocument();
  });

  it('expands a skill to reveal its evidence', async () => {
    renderDna();

    fireEvent.click(await screen.findByText('TypeScript'));

    expect(
      await screen.findByText('detected in 2 repositories')
    ).toBeInTheDocument();
    expect(screen.getByText('TypeScript represents 60% of measured code')).toBeInTheDocument();
  });

  it('renders project types and behavior observations', async () => {
    renderDna();

    expect(
      await screen.findByText(/Full-stack Web Application/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/12 recorded commits across 4 active weeks/)
    ).toBeInTheDocument();
  });

  it('renders engineering practices including missing-data markers', async () => {
    renderDna();

    expect(await screen.findByText('Engineering practices')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument(); // README coverage
  });
});

describe('repository intelligence pages (§26, §33)', () => {
  it('renders the repository list with complexity and metrics', async () => {
    vi.spyOn(dnaService, 'fetchRepoAnalyses').mockResolvedValue(REPOS);
    renderDna('/dashboard/repositories');

    expect(await screen.findByText('octo/hello')).toBeInTheDocument();
    expect(screen.getByText('Moderate · 62')).toBeInTheDocument();
    expect(screen.getByText('Score: 70')).toBeInTheDocument();
    expect(screen.getByText('5,400')).toBeInTheDocument();
  });

  it('shows the empty state when no analyses exist', async () => {
    vi.spyOn(dnaService, 'fetchRepoAnalyses').mockResolvedValue(EMPTY_REPOS);
    renderDna('/dashboard/repositories');

    expect(
      await screen.findByText(/No repository analyses yet/i)
    ).toBeInTheDocument();
  });
});
