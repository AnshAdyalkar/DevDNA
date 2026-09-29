/**
 * Socket.IO client for live sync progress (Phase 3 §28-§29).
 * Connects with `withCredentials` so the HTTP-only auth cookie reaches the
 * handshake — the backend validates it and joins the private user room.
 * Tokens are never read or sent by frontend JS.
 */
import { io, type Socket } from 'socket.io-client';

import { env } from '../config/env';

export interface SyncProgressPayload {
  jobId: string;
  progress: number;
  step: string;
}

export interface SyncCompletedPayload {
  jobId: string;
  progress: number;
  repositories: number;
  commits: number;
}

export interface SyncFailedPayload {
  jobId: string;
  error: string;
}

let socket: Socket | null = null;

/** Connect (once) and join the authenticated user's sync room. */
export function connectSyncSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io(env.VITE_SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });
  return socket;
}

export function getSyncSocket(): Socket | null {
  return socket;
}

/** Subscribe to sync events for a specific job; returns an unsubscribe fn. */
export function onSyncProgress(
  jobId: string,
  handlers: {
    onProgress?: (p: SyncProgressPayload) => void;
    onCompleted?: (p: SyncCompletedPayload) => void;
    onFailed?: (p: SyncFailedPayload) => void;
  }
): () => void {
  const s = connectSyncSocket();

  const progress = (p: SyncProgressPayload) => {
    if (p.jobId === jobId) handlers.onProgress?.(p);
  };
  const completed = (p: SyncCompletedPayload) => {
    if (p.jobId === jobId) handlers.onCompleted?.(p);
  };
  const failed = (p: SyncFailedPayload) => {
    if (p.jobId === jobId) handlers.onFailed?.(p);
  };

  s.on('github:sync:progress', progress);
  s.on('github:sync:completed', completed);
  s.on('github:sync:failed', failed);

  return () => {
    s.off('github:sync:progress', progress);
    s.off('github:sync:completed', completed);
    s.off('github:sync:failed', failed);
  };
}

export function disconnectSyncSocket(): void {
  socket?.disconnect();
  socket = null;
}
