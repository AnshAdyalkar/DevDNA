/** Health & service-status endpoints. */
import mongoose from 'mongoose';

import { databaseState } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler, ok } from '../utils/api.js';
import { pythonHealth } from '../utils/pythonClient.js';

/**
 * GET /health — liveness probe (never fails fast on dependencies).
 */
export const healthHandler = (_req: unknown, res: unknown): void => {
  const resTyped = res as { status(code: number): { json(body: unknown): void } };
  resTyped.status(200).json({
    status: 'ok',
    service: 'backend',
    database: databaseState(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

/**
 * GET /api/status — aggregated status of every downstream dependency.
 * The dashboard calls this to show which services are online.
 */
export const statusHandler = asyncHandler(async (_req, res) => {
  let pythonService: 'up' | 'down' | 'not_configured' = 'not_configured';
  if (env.PYTHON_SERVICE_URL) {
    try {
      await pythonHealth();
      pythonService = 'up';
    } catch {
      pythonService = 'down';
    }
  }

  ok(res, {
    services: {
      api: {
        status: 'up' as const,
        uptimeSeconds: Math.floor(process.uptime()),
        version: process.env.npm_package_version ?? '0.1.0'
      },
      database: {
        status: (databaseState() === 'connected' ? 'up' : 'down') as 'up' | 'down',
        state: databaseState(),
        name: mongoose.connection.name || null
      },
      pythonService: {
        status: pythonService,
        url: env.PYTHON_SERVICE_URL
      }
    },
    timestamp: new Date().toISOString()
  });
});
