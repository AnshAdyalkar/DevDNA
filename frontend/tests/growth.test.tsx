/**
 * Phase 5 frontend tests (§35): role selection, gap display, roadmap
 * display, project cards, project details, loading/empty/error states.
 * The growth service is mocked — no network, no sockets.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/services/api';
import * as growthService from '@/services/growthService';
import { GrowthPage } from '@/pages/GrowthPage';
import { GrowthRoadmapPage } from '@/pages/GrowthRoadmapPage';
import { GrowthProjectsPage } from '@/pages/GrowthProjectsPage';
import { GrowthProjectDetailPage } from '@/pages/GrowthProjectDetailPage';
import { useAuthStore } from '@/store/authStore';
import type { PublicUser } from '../../shared/types';

const USER: PublicUser = {
  id: 'u1',
  name: 'Ada Lovelace',
  username: 'ada-dev',
  email: 'ada@example.com',
  githubConnected: true,
  createdAt: '2026-01-01T00:00:00.000Z'
};

const ROLES: growthService.RoleMatrixDTO[] = [
  {
    role: 'Full Stack Developer',
    description: 'Builds complete web products.',
    skills: [
      { name: 'JavaScript', importance: 0.9, requiredLevel: 75 },
      { name: 'Testing', importance: 0.7, requiredLevel: 60 }
    ]
  },
  {
    role: 'DevOps Engineer',
    description: 'Automates build and deploy.',
    skills: [{ name: 'Docker', importance: 0.9, requiredLevel: 75 }]
  }
];

const GAPS: growthService.GapsPayload = {
  targetRole: 'Full Stack Developer',
  analysisVersion: '1.0',
  strengths: ['React', 'Node.js'],
  gaps: [
    {
      skill: 'Testing',
      requiredLevel: 60,
      currentScore: 42,
      confidence: 0.7,
      gap: 18,
      priority: 'MEDIUM',
      priorityScore: 0.51,
      kind: 'demonstrated',
      evidence: ['2 of 4 repositories have tests', 'Average testing score across repositories is low (38/100)'],
      dependencies: []
    },
    {
      skill: 'Docker',
      requiredLevel: 50,
      currentScore: null,
      confidence: null,
      gap: 50,
      priority: 'HIGH',
      priorityScore: 0.85,
      kind: 'not_detected',
      evidence: ['No evidence of Docker found in your synchronized repositories'],
      dependencies: ['Linux']
    }
  ]
};

const ROADMAP: growthService.Roadmap = {
  _id: 'rm1',
  targetRole: 'Full Stack Developer',
  version: 2,
  analysisVersion: '1.0',
  generatedAt: '2026-09-28T00:00:00+00:00',
  updatedAt: '2026-09-28T00:00:00+00:00',
  estimatedDuration: '3 weeks',
  phases: [
    {
      id: 'phase-1',
      order: 1,
      title: 'Testing fundamentals',
      description: 'Closes your Testing gap for the Full Stack Developer role.',
      skills: ['Testing'],
      priority: 'MEDIUM',
      prerequisites: [],
      estimatedDuration: '1 week',
      learningObjectives: ['Write unit tests for the core module', 'Measure test coverage'],
      resources: [
        { name: 'Jest Documentation', type: 'Documentation', url: 'https://jestjs.io/docs/getting-started' },
        { name: 'Testing Practices (book)', type: 'Book', url: null }
      ],
      project: 'Add a tested CI pipeline to one of your repositories',
      completed: false
    },
    {
      id: 'phase-2',
      order: 2,
      title: 'Docker fundamentals',
      description: 'Closes your Docker gap.',
      skills: ['Docker'],
      priority: 'HIGH',
      prerequisites: ['phase-1'],
      estimatedDuration: '1 week',
      learningObjectives: ['Containerize an existing application with a Dockerfile'],
      resources: [{ name: 'Docker Documentation', type: 'Documentation', url: 'https://docs.docker.com/' }],
      project: 'Containerize and ship one of your existing projects',
      completed: false
    }
  ]
};

const PROJECTS: growthService.ProjectRecommendation[] = [
  {
    _id: '64b0000000000000000000ab',
    targetRole: 'Full Stack Developer',
    title: 'Production-Style Task Management Platform',
    description: 'A full-stack task platform with auth, caching and tests.',
    difficulty: 'Advanced',
    estimatedDuration: '5-8 weeks',
    technologies: ['React', 'Node.js', 'Testing'],
    skillsDeveloped: ['Testing', 'System Design'],
    gapsAddressed: ['Testing', 'Docker'],
    prerequisites: [],
    architecture: 'React\n   ↓\nNode.js API',
    milestones: [
      {
        order: 1,
        title: 'Automated testing',
        description: 'Cover API and critical UI paths with automated tests.',
        skills: ['Testing'],
        estimatedDuration: '1 week'
      }
    ],
    generatedAt: '2026-09-28T00:00:00+00:00'
  }
];

function renderGrowth(path = '/dashboard/growth') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/growth" element={<GrowthPage />} />
        <Route path="/dashboard/growth/roadmap" element={<GrowthRoadmapPage />} />
        <Route path="/dashboard/growth/projects" element={<GrowthProjectsPage />} />
        <Route path="/dashboard/growth/projects/:id" element={<GrowthProjectDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: USER, isLoading: false });
  vi.restoreAllMocks();
  vi.spyOn(growthService, 'onGrowthProgress').mockResolvedValue(() => undefined);
  vi.spyOn(growthService, 'fetchRoles').mockResolvedValue({ roles: ROLES });
});

describe('role selection (§16, §35)', () => {
  it('requires a target role before gaps can be shown (§36)', async () => {
    renderGrowth();

    expect(await screen.findByText('Skill Gap Intelligence')).toBeInTheDocument();
    expect(screen.getByText(/Select a target role to see your skill gaps/i)).toBeInTheDocument();
  });

  it('lists roles and enables Analyze only after selection', async () => {
    renderGrowth();

    const select = (await screen.findByLabelText('Target role')) as HTMLSelectElement;
    await waitFor(() => {
      expect(select.options.length).toBe(3); // placeholder + 2 roles
    });

    const analyzeButton = screen.getByRole('button', { name: /analyze skill gaps/i });
    expect(analyzeButton).toBeDisabled();

    fireEvent.change(select, { target: { value: 'Full Stack Developer' } });
    expect(analyzeButton).toBeEnabled();
  });

  it('starts the growth analysis for the selected role (§19, §20)', async () => {
    const startSpy = vi
      .spyOn(growthService, 'startGrowthAnalysis')
      .mockResolvedValue({ jobId: 'gj1', status: 'RUNNING', targetRole: 'Full Stack Developer', reused: false });
    vi.spyOn(growthService, 'fetchGaps').mockRejectedValue(new Error('none yet'));
    vi.spyOn(growthService, 'fetchRoadmap').mockRejectedValue(new Error('none yet'));
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: [] });
    vi.spyOn(growthService, 'fetchOutdated').mockResolvedValue({ outdated: false, profileUpdatedAt: null, roadmapGeneratedAt: null });
    renderGrowth();

    const select = (await screen.findByLabelText('Target role')) as HTMLSelectElement;
    // Wait for the mocked roles to populate the select before changing it.
    await waitFor(() => {
      expect(select.options.length).toBe(3); // placeholder + 2 roles
    });
    fireEvent.change(select, { target: { value: 'Full Stack Developer' } });
    // The role-driven refetch rejects ("none yet") — let that refresh cycle
    // settle so the no-role empty state (with its own Analyze button) unmounts.
    await screen.findByText('Failed to load growth analysis');
    fireEvent.click(screen.getByRole('button', { name: /analyze skill gaps/i }));

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith('Full Stack Developer');
    });
  });
});

describe('gap display (§21, §22, §35)', () => {
  beforeEach(() => {
    // These tests need a pre-selected role so the hook loads gaps on mount.
    useAuthStore.setState({ user: { ...USER, targetRole: 'Full Stack Developer' }, isLoading: false });
    vi.spyOn(growthService, 'fetchGaps').mockResolvedValue(GAPS);
    vi.spyOn(growthService, 'fetchRoadmap').mockResolvedValue(ROADMAP);
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: PROJECTS });
    vi.spyOn(growthService, 'fetchOutdated').mockResolvedValue({ outdated: false, profileUpdatedAt: null, roadmapGeneratedAt: null });
  });

  it('renders gap cards with current/target, gap size and priority', async () => {
    renderGrowth();

    expect(await screen.findByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Current: 42 · Target: 60')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    // Not-detected skills show "insufficient evidence", never a fake zero (§36).
    expect(screen.getByText('Current: insufficient evidence · Target: 50')).toBeInTheDocument();
  });

  it('expands a gap to reveal its evidence (§4, §22)', async () => {
    renderGrowth();

    fireEvent.click(await screen.findByText('Testing'));
    expect(await screen.findByText(/2 of 4 repositories have tests/)).toBeInTheDocument();
    expect(screen.getByText('Why this gap?')).toBeInTheDocument();
  });

  it('shows strengths and links to roadmap/projects (§21)', async () => {
    renderGrowth();

    expect(await screen.findByText(/strengths: React, Node\.js/)).toBeInTheDocument();
    expect(screen.getByText('View roadmap')).toBeInTheDocument();
    expect(screen.getByText('View projects')).toBeInTheDocument();
  });

  it('shows the outdated banner with regenerate action (§28)', async () => {
    vi.spyOn(growthService, 'fetchOutdated').mockResolvedValue({
      outdated: true,
      profileUpdatedAt: '2026-09-28T02:00:00+00:00',
      roadmapGeneratedAt: '2026-09-28T00:00:00+00:00'
    });
    renderGrowth();

    expect(
      await screen.findByText(/Your Developer DNA has changed/i)
    ).toBeInTheDocument();
  });

  it('shows an error state when the API fails', async () => {
    vi.spyOn(growthService, 'fetchGaps').mockRejectedValue(
      new ApiRequestError('The growth service is unavailable', 'SERVICE_UNAVAILABLE', 503)
    );
    renderGrowth();

    await waitFor(() => {
      expect(screen.getByText(/The growth service is unavailable/i)).toBeInTheDocument();
    });
  });
});

describe('roadmap display (§23, §29, §30, §35)', () => {
  beforeEach(() => {
    vi.spyOn(growthService, 'fetchGaps').mockRejectedValue(new Error('none'));
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: [] });
    vi.spyOn(growthService, 'fetchOutdated').mockResolvedValue({ outdated: false, profileUpdatedAt: null, roadmapGeneratedAt: null });
  });

  it('renders phases with version, objectives and resources', async () => {
    vi.spyOn(growthService, 'fetchRoadmap').mockResolvedValue(ROADMAP);
    renderGrowth('/dashboard/growth/roadmap');

    expect(await screen.findByText('Your Roadmap')).toBeInTheDocument();
    expect(screen.getByText(/v2 ·/)).toBeInTheDocument();
    expect(screen.getByText('Phase 1 — Testing fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Write unit tests for the core module')).toBeInTheDocument();
    const docLink = screen.getByRole('link', { name: /Jest Documentation/i });
    expect(docLink).toHaveAttribute('href', 'https://jestjs.io/docs/getting-started');
    // Unverified URL stays name-only (§10).
    expect(screen.getByText(/Testing Practices \(book\)/)).toBeInTheDocument();
  });

  it('locks phases whose prerequisites are not completed', async () => {
    vi.spyOn(growthService, 'fetchRoadmap').mockResolvedValue(ROADMAP);
    renderGrowth('/dashboard/growth/roadmap');

    expect(await screen.findByText('Phase 2 — Docker fundamentals')).toBeInTheDocument();
    expect(screen.getByText('LOCKED')).toBeInTheDocument();
  });

  it('marks a phase complete through the service (§30)', async () => {
    vi.spyOn(growthService, 'fetchRoadmap').mockResolvedValue(ROADMAP);
    const markSpy = vi
      .spyOn(growthService, 'updatePhaseProgress')
      .mockImplementation(async (updates) => {
        const applied = updates[0]?.phaseId === 'phase-1';
        return {
          ...ROADMAP,
          phases: ROADMAP.phases.map((p) =>
            p.id === 'phase-1' ? { ...p, completed: applied, progressStatus: 'COMPLETED' as const } : p
          )
        };
      });
    renderGrowth('/dashboard/growth/roadmap');

    fireEvent.click(await screen.findByRole('button', { name: /mark complete/i }));
    await waitFor(() => {
      expect(markSpy).toHaveBeenCalledWith([{ phaseId: 'phase-1', status: 'COMPLETED' }]);
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });
  });

  it('shows the empty state when no roadmap exists', async () => {
    vi.spyOn(growthService, 'fetchRoadmap').mockRejectedValue(new Error('none'));
    renderGrowth('/dashboard/growth/roadmap');

    expect(await screen.findByText('No roadmap yet')).toBeInTheDocument();
  });
});

describe('project cards & details (§24, §25, §35)', () => {
  beforeEach(() => {
    vi.spyOn(growthService, 'fetchGaps').mockRejectedValue(new Error('none'));
    vi.spyOn(growthService, 'fetchRoadmap').mockRejectedValue(new Error('none'));
    vi.spyOn(growthService, 'fetchOutdated').mockResolvedValue({ outdated: false, profileUpdatedAt: null, roadmapGeneratedAt: null });
  });

  it('renders project cards with difficulty, duration and gaps addressed', async () => {
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: PROJECTS });
    renderGrowth('/dashboard/growth/projects');

    expect(await screen.findByText('Production-Style Task Management Platform')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText(/Duration: 5-8 weeks/)).toBeInTheDocument();
    expect(screen.getByText(/Addresses 2 current skill gaps/)).toBeInTheDocument();
  });

  it('shows the project empty state', async () => {
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: [] });
    renderGrowth('/dashboard/growth/projects');

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('renders project detail with milestones, architecture and skills (§25)', async () => {
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: PROJECTS });
    renderGrowth('/dashboard/growth/projects/64b0000000000000000000ab');

    expect(await screen.findByText('Production-Style Task Management Platform')).toBeInTheDocument();
    expect(screen.getByText('Milestone 1: Automated testing')).toBeInTheDocument();
    expect(screen.getByText(/Node\.js API/)).toBeInTheDocument();
    expect(screen.getByText('Skill gaps addressed')).toBeInTheDocument();
  });

  it('fetches a project directly when it is not in the cached list', async () => {
    vi.spyOn(growthService, 'fetchProjects').mockResolvedValue({ projects: [] });
    const oneSpy = vi.spyOn(growthService, 'fetchProject').mockResolvedValue(PROJECTS[0]);
    renderGrowth('/dashboard/growth/projects/64b0000000000000000000ff');

    await waitFor(() => {
      expect(oneSpy).toHaveBeenCalledWith('64b0000000000000000000ff');
    });
    expect(await screen.findByText('Production-Style Task Management Platform')).toBeInTheDocument();
  });
});
