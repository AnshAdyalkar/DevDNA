/** MongoDB connection management with Mongoose. */
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let connecting: Promise<void> | null = null;

/** Connect to MongoDB; safe to call multiple times — reuses the in-flight connection. */
export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    connecting = mongoose
      .connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
      .then(() => {
        logger.info('MongoDB connected', { uri: sanitizeUri(env.MONGO_URI) });
      })
      .catch((error: unknown) => {
        connecting = null;
        throw error;
      });
  }
  return connecting;
}

/** Disconnect gracefully (used on shutdown and in tests). */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

export function databaseState(): 'connected' | 'disconnected' | 'connecting' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
    case 3:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

/** Hide credentials before logging a connection string. */
function sanitizeUri(uri: string): string {
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}
