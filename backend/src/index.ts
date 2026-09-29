/** DevDNA API gateway entry point. */
import 'dotenv/config';

import http from 'node:http';

import { attachWebSockets, createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env, isTest } from './config/env.js';
import { recoverStaleSyncJobs } from './services/github/github.sync.js';
import { recoverStaleAnalysisJobs } from './services/intelligenceService.js';
import { recoverStaleGrowthJobs } from './services/growthService.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await connectDatabase();
  await recoverStaleSyncJobs();
  await recoverStaleAnalysisJobs();
  await recoverStaleGrowthJobs();

  const app = createApp();
  const server = http.createServer(app);
  attachWebSockets(server);

  server.listen(env.PORT, () => {
    logger.info(`DevDNA backend listening on port ${env.PORT}`, {
      env: env.NODE_ENV,
      pythonService: env.PYTHON_SERVICE_URL
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force-exit if close hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Fatal startup error', {
    message: error instanceof Error ? error.message : String(error)
  });
  if (!isTest) process.exit(1);
});
