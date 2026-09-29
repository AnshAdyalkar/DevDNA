/**
 * Integration tests for the Phase 1 API surface.
 * These exercise the real Express stack (no Mongo required yet —
 * database-aware endpoints degrade gracefully when Mongo is offline).
 */
import request from 'supertest';

import { createApp } from '../src/app.js';

describe('Phase 1 API surface', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('returns liveness with service metadata', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        service: 'backend'
      });
      expect(['connected', 'disconnected', 'connecting']).toContain(res.body.database);
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/status', () => {
    it('reports every dependency without throwing when they are offline', async () => {
      const res = await request(app).get('/api/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.services.api.status).toBe('up');
      expect(['up', 'down']).toContain(res.body.data.services.database.status);
      expect(['up', 'down', 'not_configured']).toContain(
        res.body.data.services.pythonService.status
      );
    });
  });

  describe('unknown routes', () => {
    it('return the standard error envelope', async () => {
      const res = await request(app).get('/api/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: expect.stringContaining('/api/does-not-exist') }
      });
    });
  });

  describe('error envelope', () => {
    it('is enforced by the central error handler', async () => {
      // CORS rejection produces an error funneled through the handler
      const res = await request(app)
        .get('/health')
        .set('Origin', 'https://evil.example.com');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
