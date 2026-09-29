/** Mongoose User model — credentials, profile, and GitHub link (Phase 3). */
import mongoose, { Schema, type Document, type Model } from 'mongoose';

import { EXPERIENCE_LEVELS, TARGET_ROLES } from '../../../shared/types.js';

export interface UserFields {
  name: string;
  username: string;
  /** Stored lowercase; comparisons are case-insensitive. */
  email: string;
  /** bcrypt hash — never selected by default, never returned by APIs. */
  passwordHash?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  college?: string;
  degree?: string;
  graduationYear?: number;
  targetRole?: (typeof TARGET_ROLES)[number];
  experienceLevel?: (typeof EXPERIENCE_LEVELS)[number];
  /** GitHub link (Phase 3) — token lives encrypted on the GitHubAccount model. */
  githubId?: number;
  githubUsername?: string;
  githubConnected: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  /** Forgot/reset-password flow (§20) — hash of a single-use token. */
  passwordResetToken?: string | undefined;
  passwordResetExpires?: Date | undefined;
}

export interface UserDocument extends UserFields, Document {
  createdAt: Date;
  updatedAt: Date;
}

interface UserModel extends Model<UserDocument> {
  /** Find a user by email, case-insensitively. */
  findByEmail(email: string): Promise<UserDocument | null>;
}

const userSchema = new Schema<UserDocument, UserModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    passwordHash: { type: String },
    avatar: { type: String },
    bio: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 100 },
    college: { type: String, maxlength: 140 },
    degree: { type: String, maxlength: 140 },
    graduationYear: { type: Number },
    targetRole: { type: String, enum: TARGET_ROLES },
    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS },

    // GitHub (Phase 3) — sparse so multiple nulls are allowed. The OAuth
    // token is NOT stored here; see models/GitHubAccount.ts.
    githubId: { type: Number, unique: true, sparse: true },
    githubUsername: { type: String },
    githubConnected: { type: Boolean, default: false },

    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    // Forgot/reset-password (§20) — only the token hash is persisted.
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date }
  },
  {
    timestamps: true,
    // Defense in depth: the hash must never ride along in JSON responses.
    toJSON: {
      virtuals: false,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

userSchema.statics.findByEmail = function findByEmail(email: string) {
  return this.findOne({ email: email.trim().toLowerCase() });
};

userSchema.index({ githubUsername: 1 }, { sparse: true });
userSchema.index({ isActive: 1 });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

export const User = mongoose.model<UserDocument, UserModel>('User', userSchema);
