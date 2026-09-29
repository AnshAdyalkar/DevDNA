/** Branch — lightweight branch metadata (Phase 3 §18); no history downloaded. */
import mongoose, { Schema, type Document } from 'mongoose';

export interface BranchDocument extends Document {
  userId: mongoose.Types.ObjectId;
  repositoryId: mongoose.Types.ObjectId;
  name: string;
  protected: boolean;
  isDefault: boolean;
  lastCommitSha?: string | null;
}

const branchSchema = new Schema<BranchDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repositoryId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
    name: { type: String, required: true },
    protected: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    lastCommitSha: { type: String }
  },
  { timestamps: true }
);

branchSchema.index({ repositoryId: 1, name: 1 }, { unique: true });

export const Branch = mongoose.model<BranchDocument>('Branch', branchSchema);
