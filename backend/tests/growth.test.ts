/**
 * Phase 5 backend tests (§35): growth analysis jobs, authorization,
 * Node→Python communication (Python mocked at the HTTP boundary),
 * roadmap/project retrieval, ownership protection, progress tracking.
 * Real MongoDB (devdna_test); the Python service is mocked.
 */
import request from 'supertest';

import { app } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { GrowthJob } from '../src/models/GrowthJob.js';
import { RoadmapProgress } from '../src/models/RoadmapProgress.js';
import { Repository } from '../src/models/Repository.js';
import { User } from '../src/models/User.js';

const USER_ID_HEX = '64b0000000000000000000aa';

const ROLE_MATRIX = {
  role: 'Full Stack Developer',
  description: 'Builds complete web products.',
  skills: [
    { name: 'JavaScript', importance: 0.9, requiredLevel: 75 },
    { name: 'React', importance: 0.85, requiredLevel: 70 },
    { name: 'Testing', importance: 0.7, requiredLevel: 60 }
  ]
};

const GAPS_PAYLOAD = {
  targetRole: 'Full Stack Developer',
  analysisVersion: '1.0',
  gaps: [
    {
      skill: 'Testing',
      requiredLevel: 60,
      currentScore: 42,
      confidence: 0.7,
      gap: 18,
      priority: 'MEDIUM',
      priorityScore: 0.44,
      kind: 'demonstrated',
      evidence: ['2 of 4 repositories have tests'],
      dependencies: []
    }
  ],
  strengths: ['React', 'JavaScript']
};

const ROADMAP_PAYLOAD = {
  _id: '64b0000000000000000000rm1',
  userId: USER_ID_HEX,
  targetRole: 'Full Stack Developer',
  version: 1,
  analysisVersion: '1.0',
  status: 'ACTIVE',
  generatedAt: '2026-09-28T00:00:00+00:00',
  updatedAt: '2026-09-28T00:00:00+00:00',
  estimatedDuration: '1 week',
  phases: [
    {
      id: 'phase-1',
      order: 1,
      title: 'Testing fundamentals',
      description: 'Closes your Testing gap.',
      skills: ['Testing'],
      priority: 'MEDIUM',
      prerequisites: [],
      estimatedDuration: '1 week',
      learningObjectives: ['Write unit tests for the core module'],
      resources: [{ name: 'Jest Documentation', type: 'Documentation', url: 'https://jestjs.io/docs/getting-started' }],
      project: 'Add a tested CI pipeline',
      completed: false
    }
  ]
};

const PROJECT_PAYLOAD = {
  _id: '64b0000000000000000000ab',
  userId: USER_ID_HEX,
  targetRole: 'Full Stack Developer',
  title: 'Production-Style Task Management Platform',
  description: 'A full-stack task platform.',
  difficulty: 'Advanced',
  estimatedDuration: '5-8 weeks',
  technologies: ['React', 'Node.js', 'Testing'],
  skillsDeveloped: ['Testing', 'System Design'],
  gapsAddressed: ['Testing'],
  prerequisites: [],
  architecture: 'React\n   ↓\nNode.js API',
  milestones: [{ order: 1, title: 'Automated testing', description: 'Cover the API', skills: ['Testing'], estimatedDuration: '1 week' }],
  generatedAt: '2026-09-28T00:00:00+00:00',
  analysisVersion: '1.0'
};

/** Mock the Python service at the HTTP boundary (FastAPI-shaped). */
function mockPython(options: { fail?: boolean } = {}) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    if (options.fail) {
      return { ok: false, status: 503, text: async () => JSON.stringify({ detail: 'unavailable' }) } as unknown as Response;
    }
    const url = String(input);
    const json = (body: unknown) =>
      ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;

    if (url.includes('/api/growth/roles')) return json({ roles: [ROLE_MATRIX] });
    if (url.includes('/api/growth/analyze')) {
      return json({
        targetRole: 'Full Stack Developer',
        analysisVersion: '1.0',
        gapsFound: 2,
        roadmapGenerated: true,
        roadmapVersion: 1,
        projectsGenerated: 3
      });
    }
    if (url.includes('/api/growth/gaps')) return json(GAPS_PAYLOAD);
    if (url.includes('/api/growth/roadmap/regenerate')) {
      return json({ roadmapVersion: 2, summary: { targetRole: 'Full Stack Developer', analysisVersion: '1.0', gapsFound: 2, roadmapGenerated: true, roadmapVersion: 2, projectsGenerated: 3 } });
    }
    if (url.includes('/api/growth/progress')) {
      // Echo the roadmap with the transmitted updates applied.
      const body = JSON.parse(String((init as { body?: string } | undefined)?.body ?? '{}'));
      const phases = ROADMAP_PAYLOAD.phases.map((p) => {
        const upd = (body.updates ?? []).find((u: { phaseId: string }) => u.phaseId === p.id);
        return upd ? { ...p, progressStatus: upd.status, completed: upd.status === 'COMPLETED' } : p;
      });
      return json({ ...ROADMAP_PAYLOAD, phases });
    }
    if (url.includes('/api/growth/roadmap')) return json(ROADMAP_PAYLOAD);
    if (url.includes('/api/growth/outdated')) {
      return json({ outdated: true, profileUpdatedAt: '2026-09-28T02:00:00+00:00', roadmapGeneratedAt: '2026-09-28T00:00:00+00:00' });
    }
    if (url.includes(`/api/growth/projects/${PROJECT_PAYLOAD._id}`)) return json(PROJECT_PAYLOAD);
    if (url.includes('/api/growth/projects')) return json({ projects: [PROJECT_PAYLOAD] });
    return { ok: false, status: 404, text: async () => JSON.stringify({ detail: 'Not found' }) } as unknown as Response;
  });
}

async function pollJob(cookie: string[], jobId: string): Promise<string> {
  let finalStatus = '';
  for (let i = 0; i < 100; i++) {
    const poll = await request(app).get(`/api/growth/status/${jobId}`).set('Cookie', cookie);
    finalStatus = poll.body.data?.status ?? '';
    if (finalStatus === 'COMPLETED' || finalStatus === 'FAILED') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return finalStatus;
}

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    User.deleteMany({}),
    GrowthJob.deleteMany({}),
    Repository.deleteMany({}),
    RoadmapProgress.deleteMany({})
  ]);
  await disconnectDatabase();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    GrowthJob.deleteMany({}),
    Repository.deleteMany({}),
    RoadmapProgress.deleteMany({})
  ]);
  jest.restoreAllMocks();
});

describe('authorization (§32, §35)', () => {
  it('rejects unauthenticated access to growth endpoints', async () => {
    expect((await request(app).post('/api/growth/analyze')).status).toBe(401);
    expect((await request(app).get('/api/growth/roles')).status).toBe(401);
    expect((await request(app).get('/api/growth/gaps')).status).toBe(401);
    expect((await request(app).get('/api/growth/roadmap')).status).toBe(401);
    expect((await request(app).get('/api/growth/projects')).status).toBe(401);
  });

  it('requires a target role to start an analysis (§36)', async () => {
    const { cookie } = await registerAndLogin(app, 'norole@example.com');
    const res = await request(app).post('/api/growth/analyze').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/target role/i);
  });
});

describe('growth analysis job (§19, §20, §35)', () => {
  it('creates a job, calls Python, and completes with a summary', async () => {
    const { cookie, email } = await registerAndLogin(app, 'growth1@example.com');
    const fetchSpy = mockPython();

    const start = await request(app)
      .post('/api/growth/analyze')
      .set('Cookie', cookie)
      .send({ targetRole: 'Full Stack Developer' });
    expect(start.status).toBe(202);
    expect(start.body.data.reused).toBe(false);
    const jobId = start.body.data.jobId as string;

    const finalStatus = await pollJob(cookie, jobId);
    expect(finalStatus).toBe('COMPLETED');
    expect(fetchSpy).toHaveBeenCalled();

    const job = await GrowthJob.findById(jobId);
    expect(job?.gapsFound).toBe(2);
    expect(job?.roadmapVersion).toBe(1);
    expect(job?.projectsGenerated).toBe(3);

    // §16: the selected role is stored on the user.
    const user = await User.findOne({ email });
    expect(user?.targetRole).toBe('Full Stack Developer');
  });

  it('reuses the active job instead of starting a duplicate', async () => {
    const { cookie, email } = await registerAndLogin(app, 'growth2@example.com');
    mockPython();
    const user = await User.findOne({ email });
    await GrowthJob.create({ userId: user?._id, targetRole: 'Full Stack Developer', status: 'RUNNING', progress: 20 });

    const res = await request(app)
      .post('/api/growth/analyze')
      .set('Cookie', cookie)
      .send({ targetRole: 'Full Stack Developer' });
    expect(res.status).toBe(202);
    expect(res.body.data.reused).toBe(true);
  });

  it('marks the job FAILED when Python is unreachable', async () => {
    const { cookie } = await registerAndLogin(app, 'growth3@example.com');
    mockPython({ fail: true });

    const start = await request(app)
      .post('/api/growth/analyze')
      .set('Cookie', cookie)
      .send({ targetRole: 'Backend Developer' });
    const jobId = start.body.data.jobId as string;

    const finalStatus = await pollJob(cookie, jobId);
    expect(finalStatus).toBe('FAILED');
    const job = await GrowthJob.findById(jobId);
    expect(job?.error).toBeTruthy();
  });

  it('status endpoint returns 404 for another user’s job (IDOR)', async () => {
    const owner = await registerAndLogin(app, 'growth-owner@example.com');
    const stranger = await registerAndLogin(app, 'growth-stranger@example.com');
    mockPython();

    const start = await request(app)
      .post('/api/growth/analyze')
      .set('Cookie', owner.cookie)
      .send({ targetRole: 'Full Stack Developer' });
    const jobId = start.body.data.jobId as string;

    // Let the owner's background job settle before the cross-user probe so
    // no in-flight pipeline work leaks into the next test.
    await pollJob(owner.cookie, jobId);

    const res = await request(app).get(`/api/growth/status/${jobId}`).set('Cookie', stranger.cookie);
    expect(res.status).toBe(404);
  });
});

describe('roles, gaps and roadmap retrieval (§35)', () => {
  it('lists supported roles with matrices (§1, §2)', async () => {
    const { cookie } = await registerAndLogin(app, 'roles@example.com');
    const fetchSpy = mockPython();
    const res = await request(app).get('/api/growth/roles').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.roles[0].role).toBe('Full Stack Developer');
    expect(res.body.data.roles[0].skills[0]).toHaveProperty('requiredLevel');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/growth/roles'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns stored gaps', async () => {
    const { cookie } = await registerAndLogin(app, 'gaps@example.com');
    mockPython();
    const res = await request(app).get('/api/growth/gaps?targetRole=Full%20Stack%20Developer').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.gaps[0].skill).toBe('Testing');
    expect(res.body.data.gaps[0].evidence).toContain('2 of 4 repositories have tests');
  });

  it('returns 503 for gaps when Python is unavailable', async () => {
    const { cookie } = await registerAndLogin(app, 'nogaps@example.com');
    mockPython({ fail: true });
    const res = await request(app).get('/api/growth/gaps?targetRole=Full%20Stack%20Developer').set('Cookie', cookie);
    expect(res.status).toBe(503);
  });

  it('returns 404 for gaps when Python has no saved analysis', async () => {
    const { cookie } = await registerAndLogin(app, 'nogaps-notfound@example.com');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: 'not found' })
    } as unknown as Response);
    const res = await request(app).get('/api/growth/gaps?targetRole=Full%20Stack%20Developer').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('returns the roadmap with phases and unlockable structure (§23)', async () => {
    const { cookie } = await registerAndLogin(app, 'roadmap@example.com');
    mockPython();
    const res = await request(app).get('/api/growth/roadmap').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.phases[0].learningObjectives).toHaveLength(1);
    expect(res.body.data.phases[0].resources[0].url).toMatch(/^https:\/\/jestjs\.io/);
  });

  it('regenerates the roadmap as a new version (§28, §29)', async () => {
    const { cookie } = await registerAndLogin(app, 'regen@example.com');
    mockPython();
    const res = await request(app)
      .post('/api/growth/roadmap/regenerate')
      .set('Cookie', cookie)
      .send({ targetRole: 'Full Stack Developer' });
    expect(res.status).toBe(200);
    expect(res.body.data.roadmapVersion).toBe(2);
  });
});

describe('project recommendations (§11-§15, §35)', () => {
  it('lists stored project recommendations', async () => {
    const { cookie } = await registerAndLogin(app, 'projects@example.com');
    mockPython();
    const res = await request(app).get('/api/growth/projects').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.projects).toHaveLength(1);
    expect(res.body.data.projects[0].milestones[0].skills).toContain('Testing');
  });

  it('returns one project with milestones and architecture', async () => {
    const { cookie } = await registerAndLogin(app, 'project@example.com');
    mockPython();
    const res = await request(app)
      .get(`/api/growth/projects/${PROJECT_PAYLOAD._id}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toContain('Task Management');
    expect(res.body.data.architecture).toContain('Node.js API');
  });

  it('rejects malformed project ids without calling Python', async () => {
    const { cookie } = await registerAndLogin(app, 'badid@example.com');
    const fetchSpy = mockPython();
    const res = await request(app).get('/api/growth/projects/not-an-objectid').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('another user’s project id yields 404 (ownership via Python §32)', async () => {
    const { cookie } = await registerAndLogin(app, 'stranger-pj@example.com');
    mockPython();
    // Valid id that does not belong to this user: the ownership-scoped
    // Python query finds nothing and 404s (§32).
    const res = await request(app).get('/api/growth/projects/64b0000000000000000000ff9').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('roadmap progress (§30, §35)', () => {
  it('marks a phase complete and records progress', async () => {
    const { cookie, email } = await registerAndLogin(app, 'progress@example.com');
    mockPython();

    const res = await request(app)
      .patch('/api/growth/roadmap/progress')
      .set('Cookie', cookie)
      .send({ updates: [{ phaseId: 'phase-1', status: 'COMPLETED' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.phases[0].progressStatus).toBe('COMPLETED');
    expect(res.body.data.phases[0].completed).toBe(true);

    const user = await User.findOne({ email });
    const record = await RoadmapProgress.findOne({ userId: user?._id, phaseId: 'phase-1' });
    expect(record?.status).toBe('COMPLETED');
    expect(record?.completedAt).toBeTruthy();
  });

  it('rejects invalid statuses and unknown phases', async () => {
    const { cookie } = await registerAndLogin(app, 'progress2@example.com');
    mockPython();

    const bad = await request(app)
      .patch('/api/growth/roadmap/progress')
      .set('Cookie', cookie)
      .send({ updates: [{ phaseId: 'phase-1', status: 'WARP' }] });
    expect(bad.status).toBe(400);

    const unknown = await request(app)
      .patch('/api/growth/roadmap/progress')
      .set('Cookie', cookie)
      .send({ updates: [{ phaseId: 'phase-99', status: 'COMPLETED' }] });
    expect(unknown.status).toBe(422);
  });
});

describe('outdated detection (§28, §35)', () => {
  it('surfaces the DNA-changed flag', async () => {
    const { cookie } = await registerAndLogin(app, 'outdated@example.com');
    mockPython();
    const res = await request(app).get('/api/growth/outdated').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.outdated).toBe(true);
  });

  it('degrades gracefully when Python is unavailable', async () => {
    const { cookie } = await registerAndLogin(app, 'outdated2@example.com');
    mockPython({ fail: true });
    const res = await request(app).get('/api/growth/outdated').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.outdated).toBe(false);
  });
});
