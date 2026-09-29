/**
 * Phase 4 backend tests (§32): analysis job creation, authorization,
 * Node→Python communication (Python client mocked), error handling.
 * Real MongoDB; the Python service is mocked at the HTTP boundary.
 */
import request from 'supertest';

import { app } from './helpers/app.js';
import { cookiesOf, registerAndLogin } from './helpers/auth.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AnalysisJob } from '../src/models/AnalysisJob.js';
import { Repository } from '../src/models/Repository.js';
import { User } from '../src/models/User.js';

const USER_ID_HEX = '64b0000000000000000000aa';

function mockPython(_summary: Record<string, unknown>) {
  // Mock at the HTTP layer: pythonPost → fetch. We stub global fetch and
  // return FastAPI-shaped responses.
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/api/intelligence/analyze/user/')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            summary: {
              userId: USER_ID_HEX,
              status: 'completed',
              repositoriesAnalyzed: 2,
              repositoriesReanalyzed: 2,
              repositoriesCached: 0,
              skillsDetected: 5,
              analysisVersion: '1.0'
            },
            profile: {}
          })
      } as unknown as Response;
    }
    if (url.includes('/api/intelligence/profile/')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ profile: { analysisVersion: '1.0', skills: [] } })
      } as unknown as Response;
    }
    if (url.includes('/api/intelligence/repositories/user/')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ repositories: [{ repositoryId: 'r1' }] })
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: 'Not found' })
    } as unknown as Response;
  });
}

async function seedRepos(userId: string): Promise<void> {
  await Repository.insertMany([
    {
      userId,
      githubId: 111,
      name: 'hello',
      fullName: 'octo/hello',
      languages: new Map([['Python', 8000]]),
      topics: ['python'],
      fileManifest: [{ path: 'app.py', size: 4000 }],
      lastSyncedAt: new Date()
    },
    {
      userId,
      githubId: 222,
      name: 'two',
      fullName: 'octo/two',
      languages: new Map([['TypeScript', 5000]]),
      topics: ['typescript'],
      fileManifest: [{ path: 'src/index.ts', size: 3000 }],
      lastSyncedAt: new Date()
    }
  ]);
}

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await Promise.all([User.deleteMany({}), AnalysisJob.deleteMany({}), Repository.deleteMany({})]);
  await disconnectDatabase();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AnalysisJob.deleteMany({}), Repository.deleteMany({})]);
  jest.restoreAllMocks();
});

describe('POST /api/intelligence/analyze', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/intelligence/analyze');
    expect(res.status).toBe(401);
  });

  it('fails honestly with 422 when the user has no repositories (§29)', async () => {
    const { cookie } = await registerAndLogin(app, 'noanalysis@example.com');
    const res = await request(app).post('/api/intelligence/analyze').set('Cookie', cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/Not enough data/i);
  });

  it('creates a job, calls Python, and completes with a summary', async () => {
    const { cookie, email } = await registerAndLogin(app, 'analyze1@example.com');
    const user = await User.findOne({ email });
    await seedRepos(String(user?._id));
    const fetchSpy = mockPython({});

    const start = await request(app).post('/api/intelligence/analyze').set('Cookie', cookie);
    expect(start.status).toBe(202);
    const jobId = start.body.data.jobId as string;

    // Poll until the fire-and-forget pipeline settles.
    let finalStatus = '';
    for (let i = 0; i < 100; i++) {
      const poll = await request(app).get(`/api/intelligence/status/${jobId}`).set('Cookie', cookie);
      finalStatus = poll.body.data.status;
      if (finalStatus === 'COMPLETED' || finalStatus === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(finalStatus).toBe('COMPLETED');
    expect(fetchSpy).toHaveBeenCalled();

    const job = await AnalysisJob.findById(jobId);
    expect(job?.skillsDetected).toBe(5);
    expect(job?.repositoriesProcessed).toBe(2);

    // DNA profile is proxied from Python.
    const dna = await request(app).get('/api/intelligence/dna').set('Cookie', cookie);
    expect(dna.status).toBe(200);
    expect(dna.body.data.analysisVersion).toBe('1.0');
  });

  it('reuses the active job instead of starting a duplicate', async () => {
    const { cookie, email } = await registerAndLogin(app, 'analyze2@example.com');
    const user = await User.findOne({ email });
    await seedRepos(String(user?._id));
    mockPython({});

    // Simulate a running job directly — deterministic without timing races.
    await AnalysisJob.create({ userId: user?._id, status: 'RUNNING', progress: 10 });

    const res = await request(app).post('/api/intelligence/analyze').set('Cookie', cookie);
    expect(res.status).toBe(202);
    expect(res.body.data.reused).toBe(true);
  });

  it('marks the job FAILED when Python is unreachable', async () => {
    const { cookie, email } = await registerAndLogin(app, 'analyze3@example.com');
    const user = await User.findOne({ email });
    await seedRepos(String(user?._id));

    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const start = await request(app).post('/api/intelligence/analyze').set('Cookie', cookie);
    const jobId = start.body.data.jobId as string;

    for (let i = 0; i < 100; i++) {
      const poll = await request(app).get(`/api/intelligence/status/${jobId}`).set('Cookie', cookie);
      if (['COMPLETED', 'FAILED'].includes(poll.body.data.status)) {
        expect(poll.body.data.status).toBe('FAILED');
        expect(poll.body.data.error).toBeTruthy();
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  });
});

describe('authorization / IDOR (§32, §40)', () => {
  it('one user cannot read another user’s analysis job', async () => {
    const owner = await registerAndLogin(app, 'owner-a@example.com');
    const stranger = await registerAndLogin(app, 'stranger-b@example.com');

    const user = await User.findOne({ email: owner.email });
    await seedRepos(String(user?._id));
    mockPython({});

    const start = await request(app).post('/api/intelligence/analyze').set('Cookie', owner.cookie);
    const jobId = start.body.data.jobId as string;

    const res = await request(app)
      .get(`/api/intelligence/status/${jobId}`)
      .set('Cookie', stranger.cookie);
    expect(res.status).toBe(404);
  });

  it('status endpoint rejects unknown job ids cleanly', async () => {
    const { cookie } = await registerAndLogin(app, 'unknown-job@example.com');
    const res = await request(app)
      .get('/api/intelligence/status/64b0000000000000000000ff')
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/intelligence/dna + repositories', () => {
  it('returns 404 when no analysis exists (Python 404)', async () => {
    const { cookie } = await registerAndLogin(app, 'nodna@example.com');
    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ detail: 'not found' })
        }) as unknown as Response
    );
    const res = await request(app).get('/api/intelligence/dna').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('returns 503 when Python is unavailable', async () => {
    const { cookie } = await registerAndLogin(app, 'dna-service-down@example.com');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/intelligence/dna').set('Cookie', cookie);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('proxies the stored repository analyses', async () => {
    const { cookie, email } = await registerAndLogin(app, 'repos@example.com');
    const user = await User.findOne({ email });
    await seedRepos(String(user?._id));
    mockPython({});

    const res = await request(app).get('/api/intelligence/repositories').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.repositories).toHaveLength(1);
  });
});
