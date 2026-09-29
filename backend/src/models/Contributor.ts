/** Contributor — who builds a repository (Phase 3 §24): personal vs collaborative signal. */
import mongoose, { Schema, type Document } from 'mongoose';

export interface ContributorDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  githubId: number;
  login: string;
  contributions: number;
}

const contributorSchema = new Schema<ContributorDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubId: { type: Number, required: true },
    login: { type: String, required: true },
    contributions: { type: Number, default: 0 }
  },
  { timestamps: true }
);

contributorSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });

export const Contributor = mongoose.model<ContributorDocument>('Contributor', contributorSchema);
