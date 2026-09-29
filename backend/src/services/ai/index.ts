/**
 * Centralized re-exports for the AI layer so service code can import from a
 * single module (`services/ai/index.js`) without reaching into internals.
 */
export {
  AINotConfiguredError,
  AIStructuredOutputError,
  MockAIProvider,
  OpenAIProvider,
  fenceUntrusted,
  generateStructured,
  groundingSystemPrompt,
  stripPromptInjection,
  type AIProvider,
  type AIProviderName,
  type AIProviderRequest,
  type StructuredResult
} from './provider.js';
export { aiConfigSummary, createAIProvider } from './providerFactory.js';
