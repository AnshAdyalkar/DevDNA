/** AI service — wraps /api/ai endpoints (Phase 6 §8, §9, §12). */
import { apiDelete, apiGet, apiPost, ApiRequestError } from './api';

export { ApiRequestError };

export type AIConversationType = 'DEVELOPER_ANALYST' | 'INTERVIEW';

export interface AIChatMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AIChatResponse {
  conversationId: string;
  message: { role: 'assistant'; content: string; timestamp: string };
}

export interface AIConversationSummary {
  _id: string;
  title: string;
  type: AIConversationType;
  contextVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversationDetail extends AIConversationSummary {
  messages: AIChatMessage[];
}

export interface AIInsightContent {
  summary: string;
  strengths?: { skill: string; evidence: string }[];
  weaknesses?: { skill: string; evidence: string }[];
  recommendations?: string[];
  nextSteps?: string[];
}

export interface AIInsightResponse {
  insight: AIInsightContent;
  cached: boolean;
  sourceDataVersion: string;
  generatedAt: string;
  /** Product wording (§51) — the server always supplies this. */
  disclaimer: string;
}

export function sendChatMessage(message: string, conversationId?: string): Promise<AIChatResponse> {
  return apiPost<AIChatResponse>('/ai/chat', { message, ...(conversationId ? { conversationId } : {}) }).then(
    (r) => r.data
  );
}

export function fetchConversations(type?: AIConversationType): Promise<{ conversations: AIConversationSummary[] }> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : '';
  return apiGet<{ conversations: AIConversationSummary[] }>(`/ai/conversations${qs}`);
}

export function fetchConversation(id: string): Promise<AIConversationDetail> {
  return apiGet<AIConversationDetail>(`/ai/conversations/${id}`);
}

export function deleteConversation(id: string): Promise<void> {
  return apiDelete(`/ai/conversations/${id}`).then(() => undefined);
}

export type InsightCardType = 'PROFILE_SUMMARY' | 'STRENGTHS' | 'WEAKNESSES' | 'RECOMMENDATIONS';

export function fetchInsight(type: InsightCardType): Promise<AIInsightResponse> {
  return apiGet<AIInsightResponse>(`/ai/insights/${type}`);
}

/** Non-secret provider configuration probe. */
export function fetchAIStatus(): Promise<{ provider: string; configured: boolean; model: string }> {
  return apiGet<{ provider: string; configured: boolean; model: string }>('/ai/status');
}
