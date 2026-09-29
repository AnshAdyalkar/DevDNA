/**
 * Minimal typed fetch wrapper used for service-to-service HTTP calls.
 * Adds timeouts, JSON encoding, and consistent error objects.
 */

export class HttpRequestError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'HttpRequestError';
    if (status !== undefined) this.status = status;
    if (body !== undefined) this.body = body;
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: unknown,
  options?: RequestOptions,
  timeoutMs = 10_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      signal: controller.signal
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(url, init);

    const text = await response.text();
    const parsed: unknown = text ? safeJson(text) : undefined;

    if (!response.ok) {
      throw new HttpRequestError(
        `HTTP ${response.status} from ${url}`,
        response.status,
        parsed
      );
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpRequestError(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw new HttpRequestError(
      `Network error calling ${url}: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export const get = <T>(url: string, options?: RequestOptions, timeoutMs?: number) =>
  request<T>('GET', url, undefined, options, timeoutMs);

export const post = <TReq, TRes>(
  url: string,
  body: TReq,
  options?: RequestOptions,
  timeoutMs?: number
) => request<TRes>('POST', url, body, options, timeoutMs);

export const del = (url: string, options?: RequestOptions, timeoutMs?: number) =>
  request<void>('DELETE', url, undefined, options, timeoutMs);
