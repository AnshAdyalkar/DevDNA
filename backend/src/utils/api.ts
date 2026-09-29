/** Standard API envelope helpers (see docs/api.md). */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function ok<T>(res: Response, data: T, message = 'Request successful', status = 200): void {
  res.status(status).json({ success: true, data, message });
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
