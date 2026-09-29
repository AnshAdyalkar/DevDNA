/**
 * InterviewSession — one adaptive practice interview run for a user.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type InterviewType = 'TECHNICAL' | 'PROJECT' | 'BEHAVIORAL';
export type InterviewDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type InterviewStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface InterviewQuestionRecord {
  question: string;
  category: string;
  difficulty: InterviewDifficulty;
  expectedConcepts: string[];
  relatedSkills: string[];
  relatedRepositoryId?: string;
  sourceEvidence?: string;
  answer?: string;
  evaluation?: Record<string, unknown>;
  /** True when this question was generated adaptively from the previous answer. */
  isFollowUp?: boolean;
  createdAt: Date;
}

export interface FinalReport {
  summary: string;
  strengths: string[];
  knowledgeGaps: string[];
  improvedAnswers: { question: string; suggestion: string }[];
  nextSteps: string[];
  /** Provenance (§50). */
  promptVersion: string;
  provider: string;
  model: string;
}

export interface InterviewSessionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  targetRole: string;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  status: InterviewStatus;
  questionCount: number;
  currentQuestion?: number;
  questions: InterviewQuestionRecord[];
  overallScore?: number;
  finalReport?: FinalReport;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const interviewQuestionSchema = new Schema<InterviewQuestionRecord>(
  {
    question: { type: String, required: true, maxlength: 4000 },
    category: { type: String, required: true },
    difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
    expectedConcepts: { type: [String], default: [] },
    relatedSkills: { type: [String], default: [] },
    relatedRepositoryId: { type: String },
    sourceEvidence: { type: String },
    answer: { type: String, maxlength: 8000 },
    evaluation: { type: Schema.Types.Mixed },
    isFollowUp: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const interviewSessionSchema = new Schema<InterviewSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetRole: { type: String, required: true },
    interviewType: { type: String, enum: ['TECHNICAL', 'PROJECT', 'BEHAVIORAL'], required: true },
    difficulty: { type: String, enum: ['EASY', 'MEDIUM', 'HARD'], required: true },
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'NOT_STARTED' },
    questionCount: { type: Number, required: true, min: 1, max: 20 },
    currentQuestion: { type: Number, default: 0 },
    questions: { type: [interviewQuestionSchema], default: [] },
    overallScore: { type: Number, min: 0, max: 100 },
    finalReport: {
      type: {
        summary: { type: String, maxlength: 6000 },
        strengths: { type: [String], default: [] },
        knowledgeGaps: { type: [String], default: [] },
        improvedAnswers: {
          type: [{ question: { type: String, maxlength: 2000 }, suggestion: { type: String, maxlength: 4000 } }],
          default: []
        },
        nextSteps: { type: [String], default: [] },
        promptVersion: { type: String },
        provider: { type: String },
        model: { type: String }
      },
      default: undefined
    },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

interviewSessionSchema.index({ userId: 1, createdAt: -1 });

export const InterviewSession = mongoose.model<InterviewSessionDocument>('InterviewSession', interviewSessionSchema);
