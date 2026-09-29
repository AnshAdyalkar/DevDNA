/**
 * Factory for the AI provider abstraction (§3).
 *
 * Behavior rules:
 *  - AI_PROVIDER=mock → explicit dev/test provider (never a silent fallback).
 *  - AI_PROVIDER=openai without a key → a provider instance whose every call
 *    throws AINotConfiguredError (fail closed, clear error, no fake answers).
 *  - Unknown AI_PROVIDER value → throws immediately at creation time.
 */
import { env } from '../../config/env.js';
import { AINotConfiguredError, MockAIProvider, OpenAIProvider, type AIProvider, type AIProviderName } from './provider.js';

function providerName(): AIProviderName {
  const value = (env.AI_PROVIDER ?? 'mock').trim().toLowerCase();
  if (value === 'openai') return 'openai';
  if (value === 'mock' || value === '') return 'mock';
  throw new AINotConfiguredError(
    `Unsupported AI_PROVIDER "${env.AI_PROVIDER}" — supported values: openai, mock`
  );
}

export function createAIProvider(): AIProvider {
  const provider = providerName();
  if (provider === 'openai') {
    // Constructed even without a key: the instance fails closed on use with a
    // clear AINotConfiguredError instead of silently answering with fake data.
    return new OpenAIProvider(
      env.AI_API_KEY,
      env.AI_MODEL,
      env.AI_TIMEOUT_MS,
      env.AI_BASE_URL || undefined
    );
  }
  return new MockAIProvider();
}

/** Fast configuration probe used by /api/ai/status and tests. */
export function aiConfigSummary(): {
  provider: AIProviderName;
  configured: boolean;
  model: string;
} {
  const provider = createAIProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured(),
    // Model name is not secret; the API key is never included here.
    model: env.AI_MODEL
  };
}
