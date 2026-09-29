/**
 * useAIAnalyst — Developer Analyst chat state (§8, §9).
 * Keeps one conversation thread; sending a message appends the user turn
 * optimistically and replaces it with the persisted pair on success.
 */
import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError } from '../services/api';
import {
  fetchConversation,
  sendChatMessage,
  type AIChatMessage,
  type AIConversationDetail
} from '../services/aiService';

export interface AnalystMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  timestamp: string;
}

function toAnalystMessages(messages: AIChatMessage[]): AnalystMessage[] {
  return messages.flatMap((m, i) => {
    if (m.role !== 'USER' && m.role !== 'ASSISTANT') return [];
    return [{ id: `${m.timestamp}-${i}`, role: m.role, content: m.content, timestamp: m.timestamp }];
  });
}

export function useAIAnalyst() {
  const [conversation, setConversation] = useState<AIConversationDetail | null>(null);
  const [messages, setMessages] = useState<AnalystMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      // The backend auto-creates the thread on first message; here we just
      // surface the most recent analyst conversation if one exists.
      const { conversations } = await import('../services/aiService').then((m) =>
        m.fetchConversations('DEVELOPER_ANALYST')
      );
      const latest = conversations[0];
      if (latest) {
        const detail = await fetchConversation(latest._id);
        setConversation(detail);
        setMessages(toAnalystMessages(detail.messages));
      } else {
        setConversation(null);
        setMessages([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || sending) return false;

      setError(null);
      setSending(true);
      const optimistic: AnalystMessage = {
        id: `pending-${Date.now()}`,
        role: 'USER',
        content: trimmed,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await sendChatMessage(trimmed, conversation?._id);
        setConversation((prev) =>
          prev
            ? { ...prev, _id: res.conversationId, updatedAt: res.message.timestamp }
            : ({
                _id: res.conversationId,
                title: trimmed.slice(0, 60),
                type: 'DEVELOPER_ANALYST',
                contextVersion: '1.0',
                createdAt: res.message.timestamp,
                updatedAt: res.message.timestamp,
                messages: []
              } as AIConversationDetail)
        );
        setMessages((prev) => {
          const withoutPending = prev.filter((m) => m.id !== optimistic.id);
          return [
            ...withoutPending,
            { id: `u-${res.message.timestamp}`, role: 'USER', content: trimmed, timestamp: res.message.timestamp },
            { id: `a-${res.message.timestamp}`, role: 'ASSISTANT', content: res.message.content, timestamp: res.message.timestamp }
          ];
        });
        return true;
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError(err instanceof ApiRequestError ? err.message : 'The AI analyst is unavailable');
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversation?._id, sending]
  );

  const startNewConversation = useCallback(() => {
    setConversation(null);
    setMessages([]);
    setError(null);
  }, []);

  return { messages, sending, loading, error, send, startNewConversation, conversationId: conversation?._id };
}
