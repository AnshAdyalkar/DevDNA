/** Global API rate limiter ( defense-in-depth alongside helmet ). */
import { rateLimit } from 'express-rate-limit';

import { isTest } from '../config/env.js';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' }
  }
});

/** Stricter limiter for auth endpoints to slow credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many auth attempts, try again later' }
  }
});

/**
 * Phase 6 — AI endpoints are expensive (LLM calls); keep them on a tighter
 * budget than the general API. 30 requests / 10 min / IP in development.
 */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'AI rate limit reached — please wait a few minutes' }
  }
});
