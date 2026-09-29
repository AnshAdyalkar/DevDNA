/**
 * /dashboard/interview — AI Interviewer (§13).
 * Practice assessment generated from the developer profile (§51 wording):
 * setup → personalized questions → adaptive follow-ups → final report.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Play,
  Target,
  XCircle
} from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { InlineAlert, PageLoader, buttonClasses } from '../components/ui/FormFeedback';
import { useInterview } from '../hooks/useInterview';
import { TARGET_ROLES } from '../../../shared/types';
import type { InterviewDifficulty, InterviewType } from '../services/interviewService';
import { ScoreRing } from '../components/ScoreRing';

const INTERVIEW_TYPES: { value: InterviewType; label: string; hint: string }[] = [
  { value: 'TECHNICAL', label: 'Technical', hint: 'Concepts, architecture, problem solving' },
  { value: 'PROJECT', label: 'Project deep-dive', hint: 'Questions about your actual repositories' },
  { value: 'BEHAVIORAL', label: 'Behavioral', hint: 'Collaboration, decisions, trade-offs' }
];

const DIFFICULTIES: { value: InterviewDifficulty; label: string; hint: string }[] = [
  { value: 'EASY', label: 'Easy', hint: 'Fundamentals' },
  { value: 'MEDIUM', label: 'Medium', hint: 'Standard depth' },
  { value: 'HARD', label: 'Hard', hint: 'Advanced scenarios' }
];

export function InterviewPage() {
  const {
    sessions,
    loading,
    starting,
    submitting,
    error,
    activeSessionId,
    currentQuestion,
    lastEvaluation,
    report,
    beginSession,
    submitAnswer,
    loadSessionReport,
    removeSession,
    reset
  } = useInterview();

  const [targetRole, setTargetRole] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>('TECHNICAL');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('MEDIUM');
  const [questionCount, setQuestionCount] = useState(5);
  const [answer, setAnswer] = useState('');
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (currentQuestion) answerRef.current?.focus();
  }, [currentQuestion]);

  const handleStart = async () => {
    if (!targetRole) return;
    const ok = await beginSession({ targetRole, interviewType, difficulty, questionCount });
    if (ok) setAnswer('');
  };

  const handleAnswer = async () => {
    const text = answer.trim();
    if (!text || submitting) return;
    setAnswer('');
    await submitAnswer(text);
  };

  const completed = sessions.filter((s) => s.status === 'COMPLETED');

  // ── Final report view ──────────────────────────────────────────────────
  if (report) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-white">Interview report</h1>
          <p className="mt-1 text-sm text-slate-400">
            Practice assessment generated from your developer profile — not a hiring decision.
          </p>
        </header>

        <Card>
          <div className="flex items-center gap-6">
            <ScoreRing value={report.overallScore} label="Overall" />
            <div>
              <h2 className="text-sm font-semibold text-white">Summary</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{report.summary}</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Strengths" subtitle="What worked in your answers">
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                  {s}
                </li>
              ))}
              {report.strengths.length === 0 && <p className="text-xs text-slate-500">None recorded.</p>}
            </ul>
          </Card>
          <Card title="Knowledge gaps" subtitle="Concepts to reinforce">
            <ul className="space-y-2">
              {report.knowledgeGaps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                  {s}
                </li>
              ))}
              {report.knowledgeGaps.length === 0 && <p className="text-xs text-slate-500">None recorded.</p>}
            </ul>
          </Card>
        </div>

        {report.improvedAnswers.length > 0 && (
          <Card title="Suggested improved answers" subtitle="How to strengthen weak responses">
            <ul className="space-y-4">
              {report.improvedAnswers.map((item, i) => (
                <li key={i} className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-4">
                  <p className="text-xs font-medium text-slate-400">Q: {item.question}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{item.suggestion}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {report.nextSteps.length > 0 && (
          <Card title="Next steps">
            <ol className="list-inside list-decimal space-y-1.5 text-sm text-slate-300">
              {report.nextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Card>
        )}

        <button type="button" onClick={reset} className={buttonClasses}>
          Start a new interview
        </button>
      </div>
    );
  }

  // ── Active question flow ───────────────────────────────────────────────
  if (activeSessionId && currentQuestion) {
    const progress = Math.round(((currentQuestion.currentQuestion - 1) / currentQuestion.questionCount) * 100);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Practice interview</h1>
          <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-200">
            Exit
          </button>
        </header>

        <div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>
              Question {currentQuestion.currentQuestion} of {currentQuestion.questionCount}
              {currentQuestion.followUp && (
                <Badge tone="amber">
                  follow-up
                </Badge>
              )}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {lastEvaluation && (
          <Card title="Feedback on your last answer" subtitle={`Score: ${lastEvaluation.score}/100`}>
            <p className="text-sm leading-relaxed text-slate-300">{lastEvaluation.feedback}</p>
            {lastEvaluation.improvedAnswer && (
              <p className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs leading-relaxed text-cyan-100">
                <span className="font-semibold">Stronger answer:</span> {lastEvaluation.improvedAnswer}
              </p>
            )}
          </Card>
        )}

        <Card>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Badge tone="cyan">{currentQuestion.category}</Badge>
            <Badge>{currentQuestion.difficulty}</Badge>
            {currentQuestion.relatedSkills.slice(0, 3).map((s) => (
              <Badge key={s} tone="slate">
                {s}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-base leading-relaxed text-white">{currentQuestion.question}</p>
          <textarea
            ref={answerRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            rows={6}
            maxLength={8000}
            className="mt-4 w-full resize-y rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
          />
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <button
            type="button"
            onClick={() => void handleAnswer()}
            disabled={submitting || !answer.trim()}
            className={`${buttonClasses} mt-3 w-full sm:w-auto`}
          >
            {submitting ? 'Evaluating…' : 'Submit answer'}
          </button>
        </Card>
      </div>
    );
  }

  // ── Setup + history ────────────────────────────────────────────────────
  if (loading) return <PageLoader label="Loading interviews…" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <Brain className="h-6 w-6 text-cyan-400" aria-hidden />
          AI Interviewer
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Practice assessments generated from your actual skills and repositories — not a hiring decision.
        </p>
      </header>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <Card title="Set up a practice interview" subtitle="Questions are personalized to your DevDNA evidence.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="interview-role" className="text-xs font-medium text-slate-400">
              Target role
            </label>
            <div className="relative mt-1.5">
              <Target className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <select
                id="interview-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900/70 py-2.5 pl-9 pr-9 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
              >
                <option value="">Select a role…</option>
                {TARGET_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            </div>
          </div>

          <div>
            <label htmlFor="interview-count" className="text-xs font-medium text-slate-400">
              Questions: {questionCount}
            </label>
            <input
              id="interview-count"
              type="range"
              min={3}
              max={10}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="mt-3 w-full accent-cyan-500"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {INTERVIEW_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setInterviewType(t.value)}
              className={`rounded-xl border p-3 text-left transition ${
                interviewType === t.value
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <p className="text-sm font-medium text-white">{t.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{t.hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDifficulty(d.value)}
              className={`rounded-xl border p-3 text-left transition ${
                difficulty === d.value
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              <p className="text-sm font-medium text-white">{d.label}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{d.hint}</p>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={starting || !targetRole}
          className={`${buttonClasses} mt-5 inline-flex items-center gap-2 px-6`}
        >
          <Play className="h-4 w-4" aria-hidden />
          {starting ? 'Preparing your interview…' : 'Start interview'}
        </button>
      </Card>

      <Card title="Interview history" subtitle={`${completed.length} completed`}>
        {sessions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <ListChecks className="h-4 w-4 text-slate-500" aria-hidden />
            No interviews yet — start your first one above.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sessions.map((s, i) => (
              <motion.li
                key={s._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-200">{s.targetRole}</span>
                <Badge tone="slate">{s.interviewType}</Badge>
                <Badge>{s.difficulty}</Badge>
                {s.status === 'COMPLETED' ? (
                  <>
                    <Badge tone="green">score {s.overallScore}</Badge>
                    <button
                      type="button"
                      onClick={() => void loadSessionReport(s._id)}
                      className="ml-auto text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      View report →
                    </button>
                  </>
                ) : (
                  <Badge tone="amber">{s.status}</Badge>
                )}
                <button
                  type="button"
                  onClick={() => void removeSession(s._id)}
                  className={s.status === 'COMPLETED' ? 'text-xs text-slate-500 hover:text-red-300' : 'ml-auto text-xs text-slate-500 hover:text-red-300'}
                  aria-label={`Delete ${s.targetRole} interview`}
                >
                  Delete
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
