/**
 * Commit — lean per-commit records for activity analytics (Phase 3 §15-§17).
 * No huge payloads: sha, author, message, dates, branch, link.
 * Upsert key: (repositoryId, sha).
 */
import mongoose, { Schema, type Document } from 'mongoose';

export interface CommitDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  sha: string;
  authorGithubId?: number | null;
  authorLogin?: string | null;
  message: string;
  committedAt: Date;
  authoredAt?: Date | null;
  branch: string;
  htmlUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const commitSchema = new Schema<CommitDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    sha: { type: String, required: true },
    authorGithubId: { type: Number },
    authorLogin: { type: String },
    message: { type: String, default: '' },
    committedAt: { type: Date, required: true },
    authoredAt: { type: Date },
    branch: { type: String, default: 'main' },
    htmlUrl: { type: String }
  },
  { timestamps: true }
);

commitSchema.index({ repositoryId: 1, sha: 1 }, { unique: true });
commitSchema.index({ repositoryId: 1, committedAt: -1 });
commitSchema.index({ userId: 1, committedAt: -1 });

export const Commit = mongoose.model<CommitDocument>('Commit', commitSchema);
