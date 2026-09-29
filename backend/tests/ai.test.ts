/**
 * Phase 6 — AI analyst + interviewer tests.
 * The mock provider (AI_PROVIDER=mock) exercises the full grounding pipeline
 * without external calls; ownership and fail-closed configuration are the
 * security-critical paths.
 */
import request from 'supertest';

import { app } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { AIConversation } from '../src/models/AIConversation.js';
import { AIInsight } from '../src/models/AIInsight.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { User } from '../src/models/User.js';

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  await Promise.all([
    AIConversation.deleteMany({}),
    AIInsight.deleteMany({}),
    InterviewSession.deleteMany({}),
    User.deleteMany({})
  ]);
  await disconnectDatabase();
});

beforeEach(async () => {
  await Promise.all([
    AIConversation.deleteMany({}),
    AIInsight.deleteMany({}),
    InterviewSession.deleteMany({}),
    User.deleteMany({})
  ]);
});

describe('AI chat API', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/ai/chat').send({ message: 'Hello there' });
    expect(res.status).toBe(401);
  });

  it('rejects oversized messages', async () => {
    const { cookie } = await registerAndLogin(app, 'ai-size@example.com');
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', cookie)
      .send({ message: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
  });

  it('creates a conversation and answers a grounded developer question', async () => {
    const { cookie } = await registerAndLogin(app, 'ai-chat@example.com');

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', cookie)
      .send({ message: 'What are my strongest technologies?' });

    expect(res.status).toBe(200);
    expect(res.body.data.conversationId).toBeTruthy();
    expect(res.body.data.message.role).toBe('assistant');
    expect(res.body.data.message.content).toMatch(/based on|repositories|technology/i);
  });

  it('reuses the same conversation across messages (§9)', async () => {
    const { cookie } = await registerAndLogin(app, 'ai-thread@example.com');

    const first = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', cookie)
      .send({ message: 'Explain my developer DNA.' });
    const id = first.body.data.conversationId;

    const second = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', cookie)
      .send({ message: 'Which repository should I improve first?', conversationId: id });

    expect(second.status).toBe(200);
    expect(second.body.data.conversationId).toBe(id);

    const detail = await request(app)
      .get(`/api/ai/conversations/${id}`)
      .set('Cookie', cookie);
    expect(detail.status).toBe(200);
    // Both user turns + both assistant turns persisted in the same thread.
    expect(detail.body.data.conversation.messages).toHaveLength(4);
  });
});

describe('AI conversations ownership', () => {
  it('prevents one user from viewing another user\'s conversation', async () => {
    const owner = await registerAndLogin(app, 'owner-ai@example.com');
    const stranger = await registerAndLogin(app, 'stranger-ai@example.com');

    const created = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', owner.cookie)
      .send({ message: 'Explain my developer DNA.' });

    const conversationId = created.body.data.conversationId;
    const res = await request(app)
      .get(`/api/ai/conversations/${conversationId}`)
      .set('Cookie', stranger.cookie);

    expect(res.status).toBe(404);
  });

  it('prevents a stranger from posting into another user\'s conversation', async () => {
    const owner = await registerAndLogin(app, 'owner2-ai@example.com');
    const stranger = await registerAndLogin(app, 'stranger2-ai@example.com');

    const created = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', owner.cookie)
      .send({ message: 'Explain my developer DNA.' });
    const conversationId = created.body.data.conversationId;

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Cookie', stranger.cookie)
      .send({ message: 'inject into foreign thread', conversationId });

    expect(res.status).toBe(404);
  });
});

describe('AI insights (§12, §49)', () => {
  it('rejects unknown insight types', async () => {
    const { cookie } = await registerAndLogin(app, 'insight-bad@example.com');
    const res = await request(app)
      .get('/api/ai/insights/NOT_A_TYPE')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('generates and then serves the cached insight for the same source data version', async () => {
    const { cookie } = await registerAndLogin(app, 'insight@example.com');

    const first = await request(app)
      .get('/api/ai/insights/STRENGTHS')
      .set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.cached).toBe(false);
    expect(first.body.data.insight.summary).toBeTruthy();
    expect(first.body.data.disclaimer).toMatch(/AI-generated/i);

    const second = await request(app)
      .get('/api/ai/insights/STRENGTHS')
      .set('Cookie', cookie);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
  });
});

describe('Interview API', () => {
  it('creates an interview session for the authenticated user', async () => {
    const { cookie } = await registerAndLogin(app, 'interview@example.com');

    const res = await request(app)
      .post('/api/interviews')
      .set('Cookie', cookie)
      .send({
        targetRole: 'Backend Developer',
        interviewType: 'TECHNICAL',
        difficulty: 'MEDIUM',
        questionCount: 3
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.status).toBe('NOT_STARTED');
  });

  it('rejects an unsupported target role (§13 role list)', async () => {
    const { cookie } = await registerAndLogin(app, 'interview-role@example.com');
    const res = await request(app)
      .post('/api/interviews')
      .set('Cookie', cookie)
      .send({ targetRole: 'Astronaut' });
    expect(res.status).toBe(422);
  });

  it('requires authentication to create an interview', async () => {
    const res = await request(app).post('/api/interviews');
    expect(res.status).toBe(401);
  });

  it('runs the full lifecycle: start, answers, auto-complete, report, ownership-scoped detail', async () => {
    const { cookie } = await registerAndLogin(app, 'interview-full@example.com');

    const create = await request(app)
      .post('/api/interviews')
      .set('Cookie', cookie)
      .send({ targetRole: 'Backend Developer', interviewType: 'TECHNICAL', difficulty: 'MEDIUM', questionCount: 3 });
    const { sessionId } = create.body.data;

    const start = await request(app).post(`/api/interviews/${sessionId}/start`).set('Cookie', cookie);
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('IN_PROGRESS');
    expect(start.body.data.question).toBeTruthy();

    let lastView: { status: string; evaluation?: { score: number } } | undefined;
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post(`/api/interviews/${sessionId}/answer`)
        .set('Cookie', cookie)
        .send({ answer: `Answer ${i + 1} referencing the repository evidence in my profile.` });
      expect(res.status).toBe(200);
      expect(res.body.data.evaluation).toBeTruthy();
      lastView = res.body.data;
    }
    // The final answer closes the session automatically.
    expect(lastView?.status).toBe('COMPLETED');

    // Report generation is the follow-up, idempotent completion call.
    const complete = await request(app).post(`/api/interviews/${sessionId}/complete`).set('Cookie', cookie);
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('COMPLETED');
    expect(complete.body.data.finalReport.summary).toBeTruthy();
    const again = await request(app).post(`/api/interviews/${sessionId}/complete`).set('Cookie', cookie);
    expect(again.status).toBe(200);
    expect(again.body.data.finalReport.summary).toBeTruthy();

    // Another user can never read this session (ownership check).
    const intruder = await registerAndLogin(app, 'interview-intruder@example.com');
    const forbidden = await request(app).get(`/api/interviews/${sessionId}`).set('Cookie', intruder.cookie);
    expect(forbidden.status).toBe(404);

    const detail = await request(app).get(`/api/interviews/${sessionId}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.session.status).toBe('COMPLETED');
  });
});
