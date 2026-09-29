/**
 * AI controller — developer analyst chat + conversation ownership checks (§8, §9, §10).
 * Errors from the AI layer are mapped to honest, actionable HTTP responses:
 * configuration problems → 503 AI_NOT_CONFIGURED; nothing is faked.
 */
import type { Request, Response } from 'express';

import { AINotConfiguredError, AIStructuredOutputError } from '../services/ai/index.js';
import { aiConfigSummary } from '../services/ai/providerFactory.js';
import { MAX_MESSAGE_LENGTH } from '../services/aiService.js';
import {
  deleteAIConversationForUser,
  generateDeveloperChatResponse,
  getAIConversationForUser,
  getInsight,
  listAIConversationsForUser
} from '../services/aiService.js';
import { asyncHandler, ok } from '../utils/api.js';
import { badRequest, notFound, serviceUnavailable, unauthorized } from '../utils/errors.js';

function requireUserId(req: Request): string {
  if (!req.user) throw unauthorized('Authentication required');
  return String(req.user._id);
}

/** Translate AI-layer failures into honest HTTP errors (never fake data). */
function mapAIError(error: unknown): never {
  if (error instanceof AINotConfiguredError) {
    throw serviceUnavailable(error.message);
  }
  if (error instanceof AIStructuredOutputError) {
    throw serviceUnavailable('The AI response could not be validated — please try again');
  }
  throw error;
}

export const sendChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const message = String(req.body?.message ?? '').trim();
  const conversationId = req.body?.conversationId ? String(req.body.conversationId) : undefined;

  if (!message) throw badRequest('Message is required');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
  }

  try {
    const result = await generateDeveloperChatResponse(userId, message, conversationId);
    ok(res, result);
  } catch (error) {
    mapAIError(error);
  }
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const type = req.query.type === 'INTERVIEW' || req.query.type === 'DEVELOPER_ANALYST' ? req.query.type : undefined;
  const conversations = await listAIConversationsForUser(userId, type);
  ok(res, { conversations });
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const conversationId = String(req.params.conversationId);
  const conversation = await getAIConversationForUser(userId, conversationId);

  if (!conversation) throw notFound('Conversation not found');
  ok(res, { conversation });
});

export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const conversationId = String(req.params.conversationId);
  const deleted = await deleteAIConversationForUser(userId, conversationId);

  if (!deleted) throw notFound('Conversation not found');
  ok(res, { deleted: true, conversationId });
});

export const getInsightCard = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const insightType = String(req.params.insightType ?? '').toUpperCase();
  const allowed = ['PROFILE_SUMMARY', 'STRENGTHS', 'WEAKNESSES', 'RECOMMENDATIONS'] as const;
  if (!allowed.includes(insightType as (typeof allowed)[number])) {
    throw badRequest(`Unknown insight type: ${insightType}`);
  }

  try {
    const result = await getInsight(userId, insightType as (typeof allowed)[number]);
    ok(res, { ...result, disclaimer: 'AI-generated analysis based on your DevDNA data.' });
  } catch (error) {
    mapAIError(error);
  }
});

/** Non-secret configuration probe for the settings/dashboard UI. */
export const aiStatus = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, aiConfigSummary());
});
