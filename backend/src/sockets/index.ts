/**
 * Socket.IO wiring (Phase 1: connection + system events).
 * Phases 6/9 will extend this with analysis progress and notifications.
 */
import type { Server as HttpServer } from 'node:http';

import { Server as IOServer, type Socket } from 'socket.io';

import { allowedOrigins } from '../config/env.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { logger } from '../utils/logger.js';

/** Parse a Cookie header into a map (tiny, dependency-free). */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export interface ServerSocket extends Socket {
  data: { userId?: string };
}

let io: IOServer | null = null;

/** Room name for a user's private events (sync progress, notifications). */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function initSockets(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  // Phase 3 (§28-§29): the browser's HTTP-only auth cookie rides along on the
  // websocket handshake, so sockets authenticate WITHOUT ever exposing the
  // token to frontend JavaScript. Valid sessions join their private room.
  io.use((socket: ServerSocket, next) => {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[ACCESS_COOKIE];
    if (!token) return next(); // anonymous socket — allowed, no private room
    try {
      const decoded = verifyAccessToken(token);
      socket.data.userId = decoded.sub;
      return next();
    } catch {
      return next(); // expired/invalid — treat as anonymous rather than failing
    }
  });

  io.on('connection', (socket: ServerSocket) => {
    if (socket.data.userId) {
      void socket.join(userRoom(socket.data.userId));
    }
    logger.debug('Socket connected', { id: socket.id, user: socket.data.userId ?? 'anonymous' });

    socket.on('ping', (ack?: (t: number) => void) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { id: socket.id, reason });
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

/** Broadcast a typed event to every connected client. */
export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

/** Emit to one user's private room (no-op when sockets are not initialized). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}
