/** Release — version history for project maturity analysis (Phase 3 §23). */
import mongoose, { Schema, type Document } from 'mongoose';

export interface ReleaseDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  githubId: number;
  tagName: string;
  name?: string | null;
  draft: boolean;
  prerelease: boolean;
  publishedAt?: Date | null;
  htmlUrl?: string;
}

const releaseSchema = new Schema<ReleaseDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    githubId: { type: Number, required: true },
    tagName: { type: String, required: true },
    name: { type: String },
    draft: { type: Boolean, default: false },
    prerelease: { type: Boolean, default: false },
    publishedAt: { type: Date },
    htmlUrl: { type: String }
  },
  { timestamps: true }
);

releaseSchema.index({ repositoryId: 1, githubId: 1 }, { unique: true });
releaseSchema.index({ repositoryId: 1, publishedAt: -1 });

export const Release = mongoose.model<ReleaseDocument>('Release', releaseSchema);
