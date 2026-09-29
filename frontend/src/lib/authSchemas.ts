/**
 * Client-side Zod schemas for the auth/profile forms (§17, §21.3).
 * Mirrors the backend validators — same rules, same messages.
 */
import { z } from 'zod';

import { EXPERIENCE_LEVELS, TARGET_ROLES } from '../../../shared/types';

export const PASSWORD_RULE_MESSAGE =
  'Password must contain at least 8 characters, one uppercase letter, one lowercase letter, and one number';

/** Same password policy as backend/src/services/passwordService.ts. */
export const passwordSchema = z
  .string()
  .min(8, PASSWORD_RULE_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_RULE_MESSAGE)
  .regex(/[a-z]/, PASSWORD_RULE_MESSAGE)
  .regex(/\d/, PASSWORD_RULE_MESSAGE);

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(
      /^[a-z0-9_-]+$/,
      'Username may only contain letters, numbers, hyphens and underscores'
    ),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: passwordSchema
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address')
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your new password')
}).refine((v) => v.newPassword === v.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your new password')
}).refine((v) => v.newPassword === v.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(
      /^[a-z0-9_-]+$/,
      'Username may only contain letters, numbers, hyphens and underscores'
    ),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters'),
  location: z.string().trim().max(100),
  college: z.string().trim().max(140),
  degree: z.string().trim().max(140),
  graduationYear: z.preprocess(
    (v) => {
      // Empty input (including RHF's NaN from valueAsNumber) means "not set".
      if (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
        return undefined;
      }
      return typeof v === 'string' ? Number(v) : v;
    },
    z.number().int().min(2000, 'Enter a year between 2000 and 2035').max(2035).optional()
  ),
  targetRole: z.union([z.enum(TARGET_ROLES), z.literal('')]),
  experienceLevel: z.union([z.enum(EXPERIENCE_LEVELS), z.literal('')]),
  avatar: z.string().trim().max(500)
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type ProfileValues = z.input<typeof profileSchema>;
