/** Minimal structured logger — no external dependency, JSON in production. */
import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line =
    env.NODE_ENV === 'production'
      ? JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta })
      : `${level.toUpperCase().padEnd(5)} ${message}${
          meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
        }`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (env.NODE_ENV !== 'production') emit('debug', message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta)
} as const;
