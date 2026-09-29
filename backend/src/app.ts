/**
 * Express application factory (no listen call here — that lives in index.ts,
 * which keeps integration tests able to import `app` without binding ports).
 */
import type { Server as HttpServer } from 'node:http';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { healthHandler } from './controllers/healthController.js';
import { allowedOrigins, isTest } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import aiRoutes from './routes/aiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import githubRoutes from './routes/githubRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import growthRoutes from './routes/growthRoutes.js';
import intelligenceRoutes from './routes/intelligenceRoutes.js';
import interviewRoutes from './routes/interviewRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { initSockets } from './sockets/index.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin/tools without an Origin header (curl, health checks)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  if (!isTest) app.use(morgan('dev'));

  app.use('/api', apiLimiter);

  // Liveness probe (no rate limit) + API routes
  app.get('/health', healthHandler);
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/github', githubRoutes);
  app.use('/api/intelligence', intelligenceRoutes);
  app.use('/api/growth', growthRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/interviews', interviewRoutes);

  // 404 + centralized error handling (order matters)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Attach Socket.IO to the underlying HTTP server once created. */
export function attachWebSockets(server: HttpServer): void {
  initSockets(server);
}
