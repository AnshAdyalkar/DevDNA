/**
 * GitHubSyncJob — tracks one synchronization run per user (Phase 3 §25).
 * Progress is persisted so the UI can recover after refreshes, and mirrored
 * to Socket.IO for live updates (§28-§29).
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type SyncJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type SyncStep =
  | 'profile'
  | 'repositories'
  | 'languages'
  | 'metadata'
  | 'commits'
  | 'issues'
  | 'pullRequests'
  | 'releases'
  | 'finalizing';

export interface GitHubSyncJobDocument extends Document {
  userId: mongoose.Types.ObjectId;
  status: SyncJobStatus;
  progress: number;
  currentStep?: SyncStep;
  repositoriesFound: number;
  repositoriesProcessed: number;
  commitsProcessed: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  trigger: 'manual' | 'auto';
}

const githubSyncJobSchema = new Schema<GitHubSyncJobDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'QUEUED'
    },
    progress: { type: Number, default: 0 },
    currentStep: { type: String },
    repositoriesFound: { type: Number, default: 0 },
    repositoriesProcessed: { type: Number, default: 0 },
    commitsProcessed: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: String },
    trigger: { type: String, enum: ['manual', 'auto'], default: 'manual' }
  },
  { timestamps: true }
);

githubSyncJobSchema.index({ userId: 1, createdAt: -1 });
githubSyncJobSchema.index({ userId: 1, status: 1 });

export const GitHubSyncJob = mongoose.model<GitHubSyncJobDocument>(
  'GitHubSyncJob',
  githubSyncJobSchema
);
