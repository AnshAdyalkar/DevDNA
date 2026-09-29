/** Request validation schemas for authentication endpoints (requirement §5, §6). */
import { z } from 'zod';

import { passwordSchema } from '../services/passwordService.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens and underscores');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Reset token is missing or invalid'),
  newPassword: passwordSchema
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Parse a request body against a schema, throwing ZodError on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}
