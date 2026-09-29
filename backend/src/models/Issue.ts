/** Issue — repository issue records (Phase 3 §21). Pull requests are NOT issues here. */
import mongoose, { Schema, type Document } from 'mongoose';

export interface IssueDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  githubId: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  authorLogin?: string | null;
  labels: string[];
  createdAt: Date;
  closedAt?: Date | null;
  htmlUrl?: string;
}

const issueSchema = new Schema<IssueDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubId: { type: Number, required: true },
    number: { type: Number, required: true },
    title: { type: String, default: '' },
    state: { type: String, enum: ['open', 'closed'], required: true },
    authorLogin: { type: String },
    labels: { type: [String], default: [] },
    createdAt: { type: Date, required: true },
    closedAt: { type: Date },
    htmlUrl: { type: String }
  },
  { timestamps: true }
);

issueSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
issueSchema.index({ userId: 1, state: 1 });

export const Issue = mongoose.model<IssueDocument>('Issue', issueSchema);
