/**
 * AIInsight — cached AI-generated insight per user (§49).
 *
 * One document per (userId, insightType, sourceDataVersion). The cache key is
 * deterministic: a change in the underlying Phase 4/5 data version produces a
 * new sourceDataVersion, which invalidates the cached insight naturally.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type AIInsightType =
  | 'PROFILE_SUMMARY'
  | 'STRENGTHS'
  | 'WEAKNESSES'
  | 'RECOMMENDATIONS'
  | 'PROJECT_REVIEW'
  | 'INTERVIEW_SUMMARY';

export interface AIInsightContent {
  summary: string;
  strengths?: { skill: string; evidence: string }[];
  weaknesses?: { skill: string; evidence: string }[];
  recommendations?: string[];
  nextSteps?: string[];
}

export interface AIInsightDocument extends Document {
  userId: mongoose.Types.ObjectId;
  insightType: AIInsightType;
  /** Deterministic version of the source data (DNA + growth) — see buildSourceDataVersion. */
  sourceDataVersion: string;
  content: AIInsightContent;
  /** Provenance for debugging (§50). */
  promptVersion: string;
  provider: string;
  /** Named aiModel to avoid clashing with mongoose Document#model. */
  aiModel: string;
  generatedAt: Date;
  /** After this time the insight is considered stale and must be regenerated. */
  expiresAt: Date;
}

const evidenceSchema = new Schema<{ skill: string; evidence: string }>(
  {
    skill: { type: String, required: true, maxlength: 120 },
    evidence: { type: String, required: true, maxlength: 1000 }
  },
  { _id: false }
);

const contentSchema = new Schema<AIInsightContent>(
  {
    summary: { type: String, required: true, maxlength: 4000 },
    strengths: { type: [evidenceSchema], default: [] },
    weaknesses: { type: [evidenceSchema], default: [] },
    recommendations: { type: [String], default: [] },
    nextSteps: { type: [String], default: [] }
  },
  { _id: false }
);

const aiInsightSchema = new Schema<AIInsightDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    insightType: {
      type: String,
      enum: ['PROFILE_SUMMARY', 'STRENGTHS', 'WEAKNESSES', 'RECOMMENDATIONS', 'PROJECT_REVIEW', 'INTERVIEW_SUMMARY'],
      required: true
    },
    sourceDataVersion: { type: String, required: true, maxlength: 200 },
    content: { type: contentSchema, required: true },
    promptVersion: { type: String, required: true, maxlength: 40 },
    provider: { type: String, required: true, maxlength: 40 },
    aiModel: { type: String, required: true, maxlength: 120 },
    generatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// The cache lookup: one insight per user/type/source-version.
aiInsightSchema.index({ userId: 1, insightType: 1, sourceDataVersion: 1 }, { unique: true });
// TTL cleanup of expired insights (lazy garbage collection).
aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AIInsight = mongoose.model<AIInsightDocument>('AIInsight', aiInsightSchema);
