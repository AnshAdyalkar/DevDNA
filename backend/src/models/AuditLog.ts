/**
 * AuditLog — security-relevant authentication events.
 * Never store passwords, tokens, or hashes here — metadata only.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export const AUDIT_EVENTS = [
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'USER_LOGOUT_ALL',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET',
  'SESSIONS_REVOKED',
  'SESSION_REUSE_DETECTED',
  'ACCOUNT_DELETED',
  'PROFILE_UPDATED',
  'GITHUB_CONNECTED',
  'GITHUB_DISCONNECTED',
  'GITHUB_SYNC_STARTED',
  'GITHUB_SYNC_COMPLETED',
  'GITHUB_SYNC_FAILED'
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export interface AuditLogDocument extends Document {
  event: AuditEvent;
  userId?: mongoose.Types.ObjectId;
  /** Non-identifying request metadata. */
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    event: { type: String, required: true, enum: AUDIT_EVENTS },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userAgent: { type: String, maxlength: 400 },
    ipAddress: { type: String, maxlength: 64 },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ event: 1, createdAt: -1 });
// Prune audit history after 1 year
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export const AuditLog = mongoose.model<AuditLogDocument>('AuditLog', auditLogSchema);
