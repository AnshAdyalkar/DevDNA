/**
 * Repository — normalized GitHub repository data (Phase 3 §12, §14).
 * Field names are DevDNA's own (htmlUrl, stars, …), independent of the
 * GitHub API's snake_case naming. One row per (userId, githubId) — upserted,
 * never duplicated.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export interface RepositoryDocument extends Document {
  userId: mongoose.Types.ObjectId;
  githubId: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  htmlUrl: string;
  cloneUrl?: string;
  defaultBranch: string;
  primaryLanguage?: string;
  /** Raw byte counts per language — analyzed by Python later (§13). */
  languages: Record<string, number>;
  topics: string[];
  size: number;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  license?: string;
  hasIssues: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDiscussions: boolean;
  readmeExists: boolean;
  readmeSize: number;
  /** SHA-256 of README content — full text is NOT duplicated here. */
  readmeHash?: string;
  readmeUpdatedAt?: Date;
  /**
   * Lightweight file manifest (paths + blob sizes, no contents) used by the
   * Python intelligence engine for static analysis (Phase 4). Capped and
   * tree-truncated aware; vendored directories are excluded at sync time.
   */
  fileManifest: { path: string; size: number }[];
  fileManifestTruncated: boolean;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
  pushedAt?: Date;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const repositorySchema = new Schema<RepositoryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    githubId: { type: Number, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true },
    description: { type: String },
    private: { type: Boolean, default: false },
    fork: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    htmlUrl: { type: String },
    cloneUrl: { type: String },
    defaultBranch: { type: String, default: 'main' },
    primaryLanguage: { type: String },
    languages: { type: Map, of: Number, default: new Map() },
    topics: { type: [String], default: [] },
    size: { type: Number, default: 0 },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    watchers: { type: Number, default: 0 },
    openIssues: { type: Number, default: 0 },
    license: { type: String },
    hasIssues: { type: Boolean, default: true },
    hasWiki: { type: Boolean, default: true },
    hasPages: { type: Boolean, default: false },
    hasDiscussions: { type: Boolean, default: false },
    readmeExists: { type: Boolean, default: false },
    readmeSize: { type: Number, default: 0 },
    readmeHash: { type: String },
    readmeUpdatedAt: { type: Date },
    fileManifest: {
      type: [{ path: { type: String }, size: { type: Number } }],
      default: []
    },
    fileManifestTruncated: { type: Boolean, default: false },
    githubCreatedAt: { type: Date },
    githubUpdatedAt: { type: Date },
    pushedAt: { type: Date },
    lastSyncedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

// Ownership + identity (§39) — upsert key is (userId, githubId)
repositorySchema.index({ userId: 1, githubId: 1 }, { unique: true });
repositorySchema.index({ userId: 1, primaryLanguage: 1 });
repositorySchema.index({ fullName: 1 });

export const Repository = mongoose.model<RepositoryDocument>('Repository', repositorySchema);
