/** User profile controllers (requirement §16, §19). */
import type { Request, Response } from 'express';

import { toPublicUser } from '../services/authService.js';
import { deleteAccount, updateProfile } from '../services/userService.js';
import { asyncHandler, ok } from '../utils/api.js';
import { unauthorized } from '../utils/errors.js';
import { updateProfileSchema } from '../validators/userValidator.js';

/** GET /api/users/me */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  ok(res, { user: toPublicUser(req.user) });
});

/** PATCH /api/users/me */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');
  const patch = updateProfileSchema.parse(req.body);
  const updated = await updateProfile(req.user, patch, String(req.user._id));
  ok(res, { user: toPublicUser(updated) }, 'Profile updated');
});

/** DELETE /api/users/me — permanent, cascading account deletion. */
export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthorized('Authentication required');

  // Confirmation: either { confirm: true } JSON body or ?confirm=true.
  const confirmed =
    (typeof req.body?.confirm === 'boolean' && req.body.confirm) || req.query.confirm === 'true';
  if (!confirmed) {
    ok(
      res,
      { requiresConfirmation: true },
      'This permanently deletes your account and data. Repeat with { "confirm": true }'
    );
    return;
  }

  await deleteAccount(req.user, String(req.user._id));
  ok(res, { deleted: true }, 'Account deleted');
});
