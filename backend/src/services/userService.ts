/**
 * User service — profile updates, password change, account deletion.
 * Only whitelisted fields ever reach MongoDB (requirement §16, §17).
 */
import mongoose from 'mongoose';

import { AuthSession } from '../models/AuthSession.js';
import { User, type UserDocument } from '../models/User.js';
import { audit } from './auditService.js';
import { verifyCurrentPassword } from './authService.js';
import { hashPassword } from './passwordService.js';
import { conflict, unauthorized } from '../utils/errors.js';

/** Fields the profile API may modify — everything else is ignored. */
const EDITABLE_FIELDS = [
  'name',
  'username',
  'bio',
  'location',
  'college',
  'degree',
  'graduationYear',
  'targetRole',
  'experienceLevel',
  'avatar'
] as const;

export type EditableUserField = (typeof EDITABLE_FIELDS)[number];

export async function updateProfile(
  user: UserDocument,
  patch: Partial<Record<EditableUserField, unknown>>,
  reqUserId: string
): Promise<UserDocument> {
  // Username conflict check before writing
  if (patch.username !== undefined && patch.username !== user.username) {
    const taken = await User.exists({ username: patch.username });
    if (taken) throw conflict('This username is already taken');
  }

  for (const field of EDITABLE_FIELDS) {
    if (patch[field] !== undefined) {
      (user as unknown as Record<string, unknown>)[field] = patch[field];
    }
  }
  const saved = await user.save();
  audit('PROFILE_UPDATED', {
    userId: reqUserId,
    metadata: { fields: Object.keys(patch) }
  });
  return saved;
}

export async function changePassword(
  user: UserDocument,
  currentPassword: string,
  newPassword: string,
  reqUserId: string
): Promise<void> {
  const ok = await verifyCurrentPassword(user, currentPassword);
  if (!ok) throw unauthorized('Current password is incorrect');

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Security: invalidate every existing session; the user logs back in.
  await AuthSession.updateMany(
    { userId: new mongoose.Types.ObjectId(reqUserId), revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
  audit('PASSWORD_CHANGED', { userId: reqUserId });
}

/**
 * Delete the account and all data owned by it. Phase 2 owns users +
 * sessions + audit logs; Phase 3+ collections (repositories, analyses,
 * roadmaps, interviews…) hook into the same transaction so user deletion
 * always cascades everywhere.
 */
export async function deleteAccount(user: UserDocument, reqUserId: string): Promise<void> {
  const userId = new mongoose.Types.ObjectId(reqUserId);

  // Mongo 4.0+ transactions keep the cascade atomic when a replica set /
  // sharded cluster is available; standalone dev servers fall back to
  // sequential deletes (all-or-nothing is less critical than availability).
  const session = mongoose.connection.getClient().startSession();
  try {
    const withTransaction = async (): Promise<void> => {
      await AuthSession.deleteMany({ userId }, { session });
      await User.deleteOne({ _id: userId }, { session });
      // Phase 3+ cascade point:
      // await Repository.deleteMany({ ownerId: userId }, { session });
      // await DeveloperProfile.deleteMany({ userId }, { session });
    };

    let committed = false;
    try {
      await session.withTransaction(withTransaction);
      committed = true;
    } catch {
      // Transactions unsupported (standalone mongod) — fall back to sequential.
    }
    if (!committed) {
      await withTransaction();
    }
  } finally {
    await session.endSession();
  }

  audit('ACCOUNT_DELETED', { userId: reqUserId, metadata: { email: user.email } });
}
