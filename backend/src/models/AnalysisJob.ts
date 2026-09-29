/**
 * AnalysisJob — one Developer-DNA analysis run per user (Phase 4 §22).
 * Status mirrors the Python pipeline; progress arrives via the watcher in
 * services/intelligenceService.ts and is mirrored to Socket.IO (§23).
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type AnalysisStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'FETCHING_DATA'
  | 'ANALYZING_REPOSITORIES'
  | 'CALCULATING_SKILLS'
  | 'GENERATING_DNA'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface AnalysisJobDocument extends Document {
  userId: mongoose.Types.ObjectId;
  status: AnalysisStatus;
  progress: number;
  currentStep?: string;
  repositoriesTotal?: number;
  repositoriesProcessed?: number;
  skillsDetected?: number;
  resultSummary?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const analysisJobSchema = new Schema<AnalysisJobDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, default: 'QUEUED' },
    progress: { type: Number, default: 0 },
    currentStep: { type: String },
    repositoriesTotal: { type: Number },
    repositoriesProcessed: { type: Number },
    skillsDetected: { type: Number },
    resultSummary: { type: Schema.Types.Mixed },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

analysisJobSchema.index({ userId: 1, createdAt: -1 });
analysisJobSchema.index({ userId: 1, status: 1 });

export const AnalysisJob = mongoose.model<AnalysisJobDocument>('AnalysisJob', analysisJobSchema);
