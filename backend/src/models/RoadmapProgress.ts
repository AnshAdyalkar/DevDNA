/**
 * RoadmapProgress — per-phase manual learning progress (Phase 5 §30).
 * The progress foundation: users mark roadmap phases complete; a later
 * phase can read these records to build learning analytics.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type PhaseStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED';

export interface RoadmapProgressDocument extends Document {
  userId: mongoose.Types.ObjectId;
  roadmapId: mongoose.Types.ObjectId | string;
  roadmapVersion: number;
  targetRole: string;
  phaseId: string;
  status: PhaseStatus;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  analysisVersion: string;
}

const roadmapProgressSchema = new Schema<RoadmapProgressDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roadmapId: { type: Schema.Types.Mixed, required: true },
    roadmapVersion: { type: Number, required: true },
    targetRole: { type: String, required: true },
    phaseId: { type: String, required: true },
    status: { type: String, enum: ['LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED'], default: 'AVAILABLE' },
    startedAt: { type: Date },
    completedAt: { type: Date },
    notes: { type: String, maxlength: 2000 },
    analysisVersion: { type: String, default: '1.0' }
  },
  { timestamps: true }
);

// One progress record per user+roadmap+phase.
roadmapProgressSchema.index({ userId: 1, roadmapVersion: 1, targetRole: 1, phaseId: 1 }, { unique: true });

export const RoadmapProgress = mongoose.model<RoadmapProgressDocument>(
  'RoadmapProgress',
  roadmapProgressSchema
);
