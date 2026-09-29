/**
 * Centralized error-handling middleware.
 * Maps HttpError / Zod / Mongoose / unknown errors onto the standard
 * `{ success: false, error: { code, message } }` envelope.
 */
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { isProd } from '../config/env.js';
import { HttpError } from '../utils/errors.js';
import { PythonServiceError } from '../utils/pythonClient.js';
import { logger } from '../utils/logger.js';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` }
  };
  res.status(404).json(body);
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof PythonServiceError) {
    const body: ErrorBody = {
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Intelligence service unavailable' }
    };
    res.status(503).json(body);
    return;
  }

  // 1. Our typed application errors
  if (error instanceof HttpError) {
    const body: ErrorBody = {
      success: false,
      error: { code: error.code, message: error.message, details: error.details }
    };
    res.status(error.status).json(body);
    return;
  }

  // 2. Zod validation errors
  if (error instanceof ZodError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      }
    };
    res.status(400).json(body);
    return;
  }

  // 3. Mongoose duplicate key
  if (error instanceof mongoose.Error.ValidationError) {
    const body: ErrorBody = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Document validation failed',
        details: Object.values(error.errors).map((e) => ({ path: e.path, message: e.message }))
      }
    };
    res.status(400).json(body);
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  ) {
    const body: ErrorBody = {
      success: false,
      error: { code: 'CONFLICT', message: 'A resource with these unique fields already exists' }
    };
    res.status(409).json(body);
    return;
  }

  // 4. Malformed JSON bodies
  if (error instanceof SyntaxError && 'body' in (error as object)) {
    const body: ErrorBody = {
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' }
    };
    res.status(400).json(body);
    return;
  }

  // 5. Unknown — log and return a generic 500 (never leak internals)
  logger.error('Unhandled error', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  const body: ErrorBody = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'An unexpected error occurred' : String(error)
    }
  };
  res.status(500).json(body);
}
