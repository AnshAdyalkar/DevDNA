/** Profile update validation — whitelist fields, reject unknown ones (§16, §17). */
import { z } from 'zod';

import { EXPERIENCE_LEVELS, TARGET_ROLES } from '../../../shared/types.js';

const currentYear = new Date().getFullYear();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens and underscores')
      .optional(),
    bio: z.string().trim().max(500).optional(),
    location: z.string().trim().max(100).optional(),
    college: z.string().trim().max(140).optional(),
    degree: z.string().trim().max(140).optional(),
    graduationYear: z
      .number()
      .int()
      .min(1980, 'Graduation year looks too early')
      .max(currentYear + 10, 'Graduation year looks too far in the future')
      .optional(),
    targetRole: z.enum(TARGET_ROLES).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    avatar: z.string().url('Avatar must be a valid URL').max(500).optional()
  })
  .strict(); // reject unknown fields (githubId, passwordHash, isActive, …)

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
