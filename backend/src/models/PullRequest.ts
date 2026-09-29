/** PullRequest — collaboration/development-activity signal (Phase 3 §22). */
import mongoose, { Schema, type Document } from 'mongoose';

export interface PullRequestDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  githubId: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft?: boolean;
  authorLogin?: string | null;
  authorGithubId?: number | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
  mergedAt?: Date | null;
  htmlUrl?: string;
}

const pullRequestSchema = new Schema<PullRequestDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubId: { type: Number, required: true },
    number: { type: Number, required: true },
    title: { type: String, default: '' },
    state: { type: String, enum: ['open', 'closed'], required: true },
    draft: { type: Boolean, default: false },
    authorLogin: { type: String },
    authorGithubId: { type: Number },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date },
    closedAt: { type: Date },
    mergedAt: { type: Date },
    htmlUrl: { type: String }
  },
  { timestamps: true }
);

pullRequestSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
pullRequestSchema.index({ userId: 1, createdAt: -1 });

export const PullRequest = mongoose.model<PullRequestDocument>(
  'PullRequest',
  pullRequestSchema
);
