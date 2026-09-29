/**
 * AIInsightCards — dashboard section with cached AI-generated insight cards
 * (§12, §49). Every card carries the §51 product disclaimer; failures are
 * silent for the section (AI is optional for the dashboard).
 */
import { useEffect, useState } from 'react';
import { Lightbulb, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from './ui/Card';
import { fetchInsight, type AIInsightResponse, type InsightCardType } from '../services/aiService';

const CARDS: { type: InsightCardType; title: string; icon: typeof Sparkles; tone: string }[] = [
  { type: 'STRENGTHS', title: 'AI strength insight', icon: TrendingUp, tone: 'text-emerald-400' },
  { type: 'WEAKNESSES', title: 'AI improvement insight', icon: TrendingDown, tone: 'text-amber-400' },
  { type: 'RECOMMENDATIONS', title: 'AI recommendation', icon: Lightbulb, tone: 'text-cyan-400' }
];

function InsightBody({ data }: { data: AIInsightResponse }) {
  const { insight } = data;
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-slate-300">{insight.summary}</p>
      {insight.strengths && insight.strengths.length > 0 && (
        <ul className="space-y-1">
          {insight.strengths.slice(0, 3).map((s, i) => (
            <li key={i} className="text-xs text-slate-400">
              · <span className="text-slate-300">{s.skill}</span> — {s.evidence}
            </li>
          ))}
        </ul>
      )}
      {insight.recommendations && insight.recommendations.length > 0 && (
        <ul className="space-y-1">
          {insight.recommendations.slice(0, 3).map((r, i) => (
            <li key={i} className="text-xs text-slate-400">
              · {r}
            </li>
          ))}
        </ul>
      )}
      <p className="pt-1 text-[10px] uppercase tracking-wide text-slate-600">
        {data.disclaimer} {data.cached ? '(cached)' : ''}
      </p>
    </div>
  );
}

export function AIInsightCards() {
  const [insights, setInsights] = useState<Partial<Record<InsightCardType, AIInsightResponse>>>({});
  const [hasAny, setHasAny] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // AI is a bonus on the dashboard: any failure (not configured, no data,
    // rate limit) simply hides the section instead of showing errors.
    void Promise.allSettled(CARDS.map((c) => fetchInsight(c.type))).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<InsightCardType, AIInsightResponse>> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') next[CARDS[i]!.type] = r.value;
      });
      setInsights(next);
      setHasAny(Object.keys(next).length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasAny) return null;

  return (
    <section aria-label="AI insights" className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <Sparkles className="h-4 w-4 text-cyan-400" aria-hidden />
        AI insights
      </h2>
      <div className="grid gap-5 md:grid-cols-3">
        {CARDS.map((c) => {
          const data = insights[c.type];
          if (!data) return null;
          return (
            <Card key={c.type} title={c.title}>
              <c.icon className={`h-5 w-5 ${c.tone}`} aria-hidden />
              <div className="mt-2">
                <InsightBody data={data} />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
