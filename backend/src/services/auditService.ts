/** Fire-and-forget audit logging (requirement §35). Never logs secrets. */
import type { Request } from 'express';

import { AuditLog, type AuditEvent } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export function audit(
  event: AuditEvent,
  options: {
    req?: Request | undefined;
    userId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  } = {}
): void {
  const { req, userId, metadata } = options;
  void AuditLog.create({
    event,
    userId,
    userAgent: req?.headers['user-agent']?.slice(0, 400),
    ipAddress: req?.ip,
    metadata
  }).catch((error: unknown) => {
    // Auditing must never break the request path
    logger.warn('Audit write failed', {
      event,
      message: error instanceof Error ? error.message : String(error)
    });
  });
}
