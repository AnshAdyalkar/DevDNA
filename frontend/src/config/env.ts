/** Typed, validated frontend environment. */
import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:5000/api'),
  VITE_SOCKET_URL: z.string().url().default('http://localhost:5000')
});

const parsed = schema.safeParse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_SOCKET_URL: import.meta.env.VITE_SOCKET_URL
});

if (!parsed.success) {
   
  console.error('Invalid frontend environment', parsed.error.flatten());
  throw new Error('Invalid VITE_* environment configuration');
}

export const env = parsed.data;
export type Env = typeof env;
