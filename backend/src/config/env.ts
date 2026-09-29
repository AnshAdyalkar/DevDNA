/**
 * Centralized, validated environment configuration.
 * Fails fast on missing required secrets instead of running misconfigured.
 */
import 'dotenv/config';
import { z } from 'zod';

/** Numeric env var that treats '', null, or 0 as unset (placeholder values coerce to 0). */
const intFrom = (fallback: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === 0 || v === '0' ? undefined : v),
    z.coerce.number().int().positive().default(fallback)
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFrom(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  // Tests never touch a real database — provide a safe default there.
  MONGO_URI:
    process.env.NODE_ENV === 'test'
      ? z.string().default('mongodb://127.0.0.1:27017/devdna_test')
      : z.string().min(1, 'MONGO_URI is required'),

  // JWT — required unless running tests (they mint their own short-lived secrets)
  JWT_ACCESS_SECRET:
    process.env.NODE_ENV === 'test'
      ? z.string().default('test-access-secret')
      : z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET:
    process.env.NODE_ENV === 'test'
      ? z.string().default('test-refresh-secret')
      : z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  /** Password-reset token TTL (forgot/reset flow, §20). */
  PASSWORD_RESET_TTL_MINUTES: intFrom(30),

  // Auth cookies — in production set COOKIE_SECURE=true (HTTPS-only transport).
  // Dev runs over http://localhost where `secure` cookies are dropped by browsers.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'true' : 'false')
    .transform((v) => v === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // Python intelligence service
  PYTHON_SERVICE_URL: z.string().default('http://127.0.0.1:8000'),
  PYTHON_SERVICE_TIMEOUT_MS: intFrom(15000),
  PYTHON_INTERNAL_KEY: z.string().default(''),

  // AI provider (Phase 6) — the key is server-side only, never sent to the browser
  AI_PROVIDER: z.string().default('mock'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_MAX_TOKENS: intFrom(500),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_TIMEOUT_MS: intFrom(30000),
  /** OpenAI-compatible base URL override (Azure/OpenRouter/local gateways). */
  AI_BASE_URL: z.string().default(''),

  // GitHub (Phase 3) — optional so the app boots without it
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  /** Full OAuth callback URL (alias: GITHUB_REDIRECT_URI kept for back-compat). */
  GITHUB_CALLBACK_URL: z.string().default(''),
  /** AES-256-GCM key material for encrypting stored GitHub tokens. */
  GITHUB_TOKEN_ENCRYPTION_KEY: z.string().default(''),
  GITHUB_REDIRECT_URI: z.string().default('http://localhost:5000/api/github/callback')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  if (process.env.NODE_ENV === 'test') {
    // In tests, fail loudly with the reason instead of killing the process.
    throw new Error(`Invalid environment configuration — ${details}`);
  }
   
  console.error(`❌ Invalid environment configuration — ${details}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Origins allowed by CORS, parsed from the comma-separated CLIENT_ORIGIN. */
export const allowedOrigins = env.CLIENT_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
