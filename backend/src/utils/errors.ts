/**
 * Typed HTTP error used across controllers/middleware.
 * Every error response is funneled through the central error handler,
 * so route code can simply `throw new HttpError(...)`.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details?: unknown) =>
  new HttpError(400, 'INVALID_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Not allowed') => new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') =>
  new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message = 'Resource already exists') =>
  new HttpError(409, 'CONFLICT', message);

export const serviceUnavailable = (message = 'A dependent service is unavailable') =>
  new HttpError(503, 'SERVICE_UNAVAILABLE', message);
