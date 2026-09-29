/**
 * GitHubAccount — one row per DevDNA user who linked GitHub (Phase 3 §6).
 *
 * The OAuth access token is stored ONLY here, AES-256-GCM encrypted
 * (utils/crypto.ts). It is stripped from every JSON serialization and is
 * never sent to the frontend, logs, or sockets.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type GitHubSyncStatus = 'idle' | 'syncing' | 'error';

export interface GitHubAccountDocument extends Document {
  userId: mongoose.Types.ObjectId;
  githubId: number;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  htmlUrl?: string;
  bio?: string;
  company?: string;
  location?: string;
  blog?: string;
  twitterUsername?: string;
  publicRepos: number;
  followers: number;
  following: number;
  /** AES-256-GCM encrypted OAuth token — never serialized. */
  accessTokenEncrypted: string;
  tokenType: string;
  scope: string;
  connectedAt: Date;
  lastSyncedAt?: Date | undefined;
  syncStatus: GitHubSyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const githubAccountSchema = new Schema<GitHubAccountDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    githubId: { type: Number, required: true },
    login: { type: String, required: true },
    name: { type: String },
    email: { type: String },
    avatarUrl: { type: String },
    htmlUrl: { type: String },
    bio: { type: String },
    company: { type: String },
    location: { type: String },
    blog: { type: String },
    twitterUsername: { type: String },
    publicRepos: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    accessTokenEncrypted: { type: String, required: true },
    tokenType: { type: String, default: 'bearer' },
    scope: { type: String, default: '' },
    connectedAt: { type: Date, default: () => new Date() },
    lastSyncedAt: { type: Date },
    syncStatus: { type: String, enum: ['idle', 'syncing', 'error'], default: 'idle' }
  },
  {
    timestamps: true,
    // Defense in depth: the encrypted token must never ride along in JSON.
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.accessTokenEncrypted;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// One GitHub account per DevDNA user + lookup by GitHub id (§39)
githubAccountSchema.index({ userId: 1 }, { unique: true });
githubAccountSchema.index({ githubId: 1 }, { unique: true });

export const GitHubAccount = mongoose.model<GitHubAccountDocument>(
  'GitHubAccount',
  githubAccountSchema
);
