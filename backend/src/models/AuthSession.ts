/**
 * AuthSession — one row per issued refresh token (rotated on every refresh).
 * Only a SHA-256 hash of the token is stored; a leaked database therefore
 * cannot be replayed against the API.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export interface AuthSessionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** SHA-256 hex of the current refresh token for this session. */
  refreshTokenHash: string;
  userAgent: string;
  ipAddress?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema = new Schema<AuthSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String, default: 'unknown', maxlength: 400 },
    ipAddress: { type: String, maxlength: 64 },
    lastUsedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date }
  },
  { timestamps: true }
);

// TTL cleanup of long-expired sessions (90 days past expiry) + lookup indexes
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ refreshTokenHash: 1 });

export const AuthSession = mongoose.model<AuthSessionDocument>(
  'AuthSession',
  authSessionSchema
);
