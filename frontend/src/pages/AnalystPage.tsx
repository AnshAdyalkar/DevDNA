/**
 * /dashboard/analyst — AI Developer Analyst chat (§8).
 * Conversational interface over the grounded DevDNA context. Answers are
 * AI-generated analysis based on the user's DevDNA data (§51 wording).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dna, Send, Sparkles, Trash2 } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useAIAnalyst } from '../hooks/useAIAnalyst';
import { deleteConversation } from '../services/aiService';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

const SUGGESTED_QUESTIONS = [
  'What are my strongest technologies?',
  'Why is my backend skill score lower?',
  'Which projects should I build next?',
  'Explain my Developer DNA.'
];

export function AnalystPage() {
  const { messages, sending, loading, error, send, startNewConversation, conversationId } = useAIAnalyst();
  const [draft, setDraft] = useState('');
  const user = useAuthStore((s) => s.user);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Optional call keeps jsdom tests happy (scrollIntoView is unimplemented there).
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await send(text);
  };

  const handleDelete = async () => {
    if (!conversationId) return;
    try {
      await deleteConversation(conversationId);
      startNewConversation();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete the conversation');
    }
  };

  if (loading) return <PageLoader label="Loading your analyst…" />;

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-4xl flex-col space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <Dna className="h-6 w-6 text-cyan-400" aria-hidden />
            AI Developer Analyst
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ask anything about your profile — answers are AI-generated analysis based on your DevDNA data.
          </p>
        </div>
        {conversationId && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-red-500/40 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete conversation
          </button>
        )}
      </header>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="h-10 w-10 text-cyan-400/70" aria-hidden />
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Hi {user?.name.split(' ')[0] ?? 'there'} — ask me about your Developer DNA.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  I only describe what your repositories and scores actually show.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDraft(q)}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'USER'
                    ? 'bg-gradient-to-r from-cyan-500/90 to-indigo-500/90 text-slate-950'
                    : 'border border-slate-800 bg-slate-900/80 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-400">
                <span className="inline-flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-slate-800/70 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask about your skills, gaps, roadmap…"
            rows={1}
            maxLength={4000}
            className="max-h-32 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className={`${buttonClasses} inline-flex h-10 w-10 items-center justify-center !px-0`}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </Card>

      <p className="text-center text-[11px] text-slate-500">
        <Badge tone="slate">AI-generated</Badge> Interpretation of your DevDNA data — deterministic scores remain the
        source of truth. Need data first? <Link to="/github" className="text-cyan-400 hover:text-cyan-300">Connect GitHub</Link>.
      </p>
    </div>
  );
}
