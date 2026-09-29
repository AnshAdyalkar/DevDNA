/**
 * GrowthJob — one Skill-Gap & Growth analysis run per user+role (Phase 5 §19).
 * Statuses mirror the Python growth pipeline; progress is mirrored to
 * Socket.IO via services/growthService.ts (§20).
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type GrowthJobStatus = 'QUEUED' | 'RUNNING' | 'CALCULATING_GAPS' | 'BUILDING_DEPENDENCIES' | 'GENERATING_ROADMAP' | 'GENERATING_PROJECTS' | 'COMPLETED' | 'FAILED';

export interface GrowthJobDocument extends Document {
  userId: mongoose.Types.ObjectId;
  targetRole: string;
  status: GrowthJobStatus;
  progress: number;
  currentStep?: string;
  gapsFound?: number;
  roadmapVersion?: number;
  projectsGenerated?: number;
  resultSummary?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

const growthJobSchema = new Schema<GrowthJobDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetRole: { type: String, required: true },
    status: { type: String, default: 'QUEUED' },
    progress: { type: Number, default: 0 },
    currentStep: { type: String },
    gapsFound: { type: Number },
    roadmapVersion: { type: Number },
    projectsGenerated: { type: Number },
    resultSummary: { type: Schema.Types.Mixed },
    error: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

growthJobSchema.index({ userId: 1, createdAt: -1 });
growthJobSchema.index({ userId: 1, status: 1 });

export const GrowthJob = mongoose.model<GrowthJobDocument>('GrowthJob', growthJobSchema);
