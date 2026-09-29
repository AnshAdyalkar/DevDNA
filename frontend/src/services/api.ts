/** Typed API client — unwraps the standard { success, data } envelope. */
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

import { env } from '../config/env';
import type { ApiError } from '../../../shared/types';

export const api = axios.create({
  baseURL: env.VITE_API_URL,
  timeout: 20_000,
  withCredentials: true
});

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

/** Normalize any thrown value into an ApiRequestError for the UI. */
export function toApiError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    const body = axiosError.response?.data;
    if (body && body.success === false) {
      return new ApiRequestError(
        body.error.message,
        body.error.code,
        axiosError.response?.status
      );
    }
    if (axiosError.code === 'ECONNABORTED') {
      return new ApiRequestError('The request timed out', 'TIMEOUT');
    }
    return new ApiRequestError(
      axiosError.message || 'Network error',
      'NETWORK_ERROR',
      axiosError.response?.status
    );
  }
  return new ApiRequestError(
    error instanceof Error ? error.message : 'Unexpected error',
    'UNKNOWN'
  );
}

/** GET returning unwrapped `data`. */
export async function apiGet<T>(url: string): Promise<T> {
  try {
    const res = await api.get<{ success: boolean; data: T }>(url);
    return res.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** POST returning unwrapped `data` (with the server message if provided). */
export async function apiPost<T>(
  url: string,
  body?: unknown
): Promise<{ data: T; message?: string }> {
  try {
    const res = await api.post<{ success: boolean; data: T; message?: string }>(url, body);
    return { data: res.data.data, message: res.data.message };
  } catch (error) {
    throw toApiError(error);
  }
}

/** PATCH returning unwrapped `data`. */
export async function apiPatch<T>(
  url: string,
  body?: unknown
): Promise<{ data: T; message?: string }> {
  try {
    const res = await api.patch<{ success: boolean; data: T; message?: string }>(url, body);
    return { data: res.data.data, message: res.data.message };
  } catch (error) {
    throw toApiError(error);
  }
}

/** DELETE returning unwrapped `data`. */
export async function apiDelete<T>(
  url: string,
  body?: unknown,
  config?: { params?: Record<string, string | boolean> }
): Promise<{ data: T; message?: string }> {
  try {
    const res = await api.delete<{ success: boolean; data: T; message?: string }>(url, {
      data: body,
      params: config?.params
    });
    return { data: res.data.data, message: res.data.message };
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * 401 → silent refresh → retry once (requirement §21.4).
 *
 * Queues concurrent failures behind a single /auth/refresh call, then replays
 * them with the new cookie set. The refresh endpoint itself is never retried —
 * otherwise an expired session would loop forever.
 */
let refreshing: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
  if (!refreshing) {
    refreshing = api
      .post('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(undefined, async (error: AxiosError<ApiError>) => {
  const config = error.config as
    | (InternalAxiosRequestConfig & { _retried?: boolean })
    | undefined;

  const isRefreshCall = config?.url?.includes('/auth/refresh');
  const isAuthPageCall = config?.url?.includes('/auth/login');

  if (
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !isRefreshCall &&
    !isAuthPageCall
  ) {
    config._retried = true;
    try {
      await refreshSession();
      return api.request(config);
    } catch {
      // Refresh failed — fall through and surface the original 401.
    }
  }
  return Promise.reject(error);
});
