/**
 * AI Developer Analyst service (§5, §8, §9, §11, §12, §49).
 *
 * Grounding: every answer is generated from the compact DevDNA context built
 * by aiContextBuilder — deterministic Phases 4–5 data is the source of truth;
 * the LLM only interprets it. Missing provider configuration fails closed
 * with a clear error (no fake responses, §54).
 */
import mongoose from 'mongoose';
import { z } from 'zod';

import {
  AIConversation,
  type AIConversationDocument,
  type AIConversationType,
  type AIMessageRole
} from '../models/AIConversation.js';
import { AIInsight, type AIInsightContent, type AIInsightType } from '../models/AIInsight.js';
import { buildDeveloperAIContext, buildSourceDataVersion } from './aiContextBuilder.js';import {
  AINotConfiguredError,
  generateStructured,
  groundingSystemPrompt,
  stripPromptInjection,
  type AIProvider
} from './ai/index.js';
import { createAIProvider } from './ai/providerFactory.js';
import { INSIGHT_PROMPTS, PROMPT_VERSION } from './ai/prompts.js';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../utils/errors.js';

export const MAX_MESSAGE_LENGTH = 4000;
/** Bounded conversation window sent to the provider (§10). */
const MAX_HISTORY_TURNS = 12;
const INSIGHT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface ChatTurn {
  conversationId: string;
  message: { role: 'assistant'; content: string; timestamp: Date };
}

const insightContentSchema = z.object({
  summary: z.string().min(1).max(4000),
  strengths: z.array(z.object({ skill: z.string().min(1), evidence: z.string().min(1) })).max(12).default([]),
  weaknesses: z.array(z.object({ skill: z.string().min(1), evidence: z.string().min(1) })).max(12).default([]),
  recommendations: z.array(z.string().min(1).max(600)).max(10).default([]),
  nextSteps: z.array(z.string().min(1).max(600)).max(10).default([])
});

async function getProvider(): Promise<AIProvider> {
  const provider = createAIProvider();
  if (!provider.isConfigured()) {
    throw new AINotConfiguredError(
      'AI is not configured on this server. Set AI_PROVIDER, AI_API_KEY and AI_MODEL (server-side only) to enable AI features.'
    );
  }
  return provider;
}

async function loadOwnedConversation(userId: string, conversationId: string): Promise<AIConversationDocument | null> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
  return AIConversation.findOne({
    _id: new mongoose.Types.ObjectId(conversationId),
    userId: new mongoose.Types.ObjectId(userId)
  });
}

/**
 * Send a chat message in a conversation (creating one on first message when
 * no conversationId is supplied) and return the grounded assistant reply.
 */
export async function generateDeveloperChatResponse(
  userId: string,
  rawMessage: string,
  conversationId?: string
): Promise<ChatTurn> {
  const message = stripPromptInjection(String(rawMessage ?? '').trim()).slice(0, MAX_MESSAGE_LENGTH);
  if (!message) {
    throw badRequest('Message is required');
  }

  const provider = await getProvider();

  // Conversation reuse: one thread per analyst session (§9).
  let conversation = conversationId ? await loadOwnedConversation(userId, conversationId) : null;
  if (conversationId && !conversation) {
    throw notFound('Conversation not found');
  }
  if (!conversation) {
    conversation = await AIConversation.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: message.slice(0, 60),
      type: 'DEVELOPER_ANALYST' satisfies AIConversationType,
      messages: []
    });
  }

  const context = await buildDeveloperAIContext(userId);

  // Persist the user turn first so it is never lost on provider failure.
  conversation.messages.push({
    role: 'USER' satisfies AIMessageRole,
    content: message,
    timestamp: new Date(),
    metadata: { source: 'web-chat' }
  });

  // Bounded recent history (most recent MAX_HISTORY_TURNS *messages*).
  const recent = conversation.messages.slice(-MAX_HISTORY_TURNS);
  const history = recent.slice(0, -1).map((m) => ({
    role: m.role === 'ASSISTANT' ? ('assistant' as const) : ('user' as const),
    content: stripPromptInjection(m.content).slice(0, MAX_MESSAGE_LENGTH)
  }));

  const prompt = [
    'DevDNA developer context (deterministic data — the source of truth):',
    JSON.stringify(context),
    '',
    'Answer the developer\'s latest question using only the context above. Cite the actual scores/repositories when relevant. If something is not in the context, say so.',
    '',
    `Developer question: ${message}`
  ].join('\n');

  let answer: string;
  try {
    answer = await provider.generate({
      prompt,
      systemPrompt: groundingSystemPrompt(),
      history,
      maxTokens: env.AI_MAX_TOKENS,
      temperature: env.AI_TEMPERATURE
    });
  } catch (error) {
    await conversation.save();
    throw error;
  }

  conversation.messages.push({
    role: 'ASSISTANT' satisfies AIMessageRole,
    content: answer,
    timestamp: new Date(),
    metadata: { grounded: true, promptVersion: PROMPT_VERSION, provider: provider.name }
  });
  await conversation.save();

  return {
    conversationId: String(conversation._id),
    message: { role: 'assistant', content: answer, timestamp: new Date() }
  };
}

// ─── Conversations (§9) — strict ownership on every query ───────────────────

export async function listAIConversationsForUser(
  userId: string,
  type?: AIConversationType
): Promise<unknown[]> {
  const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
  if (type) query.type = type;
  return AIConversation.find(query)
    .sort({ updatedAt: -1 })
    .select('title type contextVersion createdAt updatedAt messages.role')
    .lean();
}

export async function getAIConversationForUser(userId: string, conversationId: string): Promise<unknown> {
  const conversation = await loadOwnedConversation(userId, conversationId);
  return conversation ? conversation.toObject() : null;
}

export async function deleteAIConversationForUser(userId: string, conversationId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return false;
  const result = await AIConversation.deleteOne({
    _id: new mongoose.Types.ObjectId(conversationId),
    userId: new mongoose.Types.ObjectId(userId)
  });
  return result.deletedCount > 0;
}

// ─── Cached dashboard insights (§12, §49) ───────────────────────────────────

export async function getInsight(
  userId: string,
  insightType: Exclude<AIInsightType, 'PROJECT_REVIEW' | 'INTERVIEW_SUMMARY'>
): Promise<{ insight: AIInsightContent; cached: boolean; sourceDataVersion: string; generatedAt: Date }> {
  const provider = await getProvider();
  const sourceDataVersion = await buildSourceDataVersion(userId, insightType);

  const cached = await AIInsight.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    insightType,
    sourceDataVersion,
    expiresAt: { $gt: new Date() }
  }).lean();

  if (cached) {
    return {
      insight: cached.content,
      cached: true,
      sourceDataVersion,
      generatedAt: cached.generatedAt
    };
  }

  const context = await buildDeveloperAIContext(userId);
  const { data, meta } = await generateStructured(
    provider,
    {
      prompt: `${INSIGHT_PROMPTS[insightType]}\n\nDevDNA context:\n${JSON.stringify(context)}`,
      systemPrompt: groundingSystemPrompt()
    },
    insightContentSchema,
    { promptVersion: PROMPT_VERSION }
  );

  const generatedAt = new Date();
  await AIInsight.updateOne(
    { userId: new mongoose.Types.ObjectId(userId), insightType, sourceDataVersion },
    {
      $set: {
        content: data,
        promptVersion: meta.promptVersion,
        provider: meta.provider,
        model: meta.model,
        generatedAt,
        expiresAt: new Date(generatedAt.getTime() + INSIGHT_TTL_MS)
      }
    },
    { upsert: true }
  );

  return { insight: data, cached: false, sourceDataVersion, generatedAt };
}
