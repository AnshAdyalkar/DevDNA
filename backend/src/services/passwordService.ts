/** Password hashing + strength rules (requirement §4, §5). */
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const BCRYPT_COST = 12;

/** Registration/password-change rule: 8+ chars, upper, lower, digit. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
