/**
 * Typed HTTP client for the Python intelligence service.
 * Sends the shared internal key on every call and maps failures
 * to a single `PythonServiceError` the API can translate into a 503.
 */
import { del, get, HttpRequestError, post } from './http.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export class PythonServiceError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PythonServiceError';
    if (status !== undefined) this.status = status;
  }
}

function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.PYTHON_INTERNAL_KEY) headers['x-internal-key'] = env.PYTHON_INTERNAL_KEY;
  return headers;
}

function normalizeError(error: unknown, context: string): PythonServiceError {
  if (error instanceof PythonServiceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Python service call failed: ${context}`, { message });
  const status = error instanceof HttpRequestError ? error.status : undefined;
  return new PythonServiceError(`Intelligence service unavailable (${context})`, status);
}

export interface PythonHealth {
  status: string;
  service: string;
  version: string;
  analyzers: string[];
}

export async function pythonHealth(): Promise<PythonHealth> {
  try {
    return await get<PythonHealth>(
      `${env.PYTHON_SERVICE_URL}/health`,
      { headers: internalHeaders() },
      env.PYTHON_SERVICE_TIMEOUT_MS
    );
  } catch (error) {
    throw normalizeError(error, 'health');
  }
}

/** Generic JSON GET to the intelligence service. */
export async function pythonGet<TRes>(path: string): Promise<TRes> {
  try {
    return await get<TRes>(
      `${env.PYTHON_SERVICE_URL}${path}`,
      { headers: internalHeaders() },
      env.PYTHON_SERVICE_TIMEOUT_MS
    );
  } catch (error) {
    throw normalizeError(error, path);
  }
}

/** Generic JSON POST to the intelligence service. */
export async function pythonPost<TReq, TRes>(
  path: string,
  payload: TReq,
  timeoutMs?: number
): Promise<TRes> {
  try {
    return await post<TReq, TRes>(
      `${env.PYTHON_SERVICE_URL}${path}`,
      payload,
      { headers: internalHeaders() },
      timeoutMs
    );
  } catch (error) {
    throw normalizeError(error, path);
  }
}

/** Generic JSON DELETE to the intelligence service (cache invalidation etc.). */
export async function pythonDelete(path: string): Promise<void> {
  try {
    await del(`${env.PYTHON_SERVICE_URL}${path}`, { headers: internalHeaders() });
  } catch (error) {
    throw normalizeError(error, path);
  }
}
