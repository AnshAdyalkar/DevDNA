/**
 * useInterview — AI Interviewer state (§13).
 * Owns: setup selections, the active question flow with adaptive follow-ups,
 * the final report and the session history.
 */
import { useCallback, useEffect, useState } from 'react';

import { ApiRequestError } from '../services/api';
import {
  answerInterview,
  completeInterview,
  createInterview,
  fetchInterview,
  listInterviews,
  startInterview,
  type InterviewDifficulty,
  type InterviewQuestionPayload,
  type InterviewReportPayload,
  type InterviewSessionSummary,
  type InterviewType
} from '../services/interviewService';

export interface InterviewReport {
  summary: string;
  strengths: string[];
  knowledgeGaps: string[];
  improvedAnswers: { question: string; suggestion: string }[];
  nextSteps: string[];
  overallScore: number;
}

export function useInterview() {
  const [sessions, setSessions] = useState<InterviewSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live question flow
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestionPayload | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<InterviewQuestionPayload['evaluation'] | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const { sessions: list } = await listInterviews();
      setSessions(list);
    } catch {
      // History is non-critical; the setup form still works.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const applyReport = useCallback((payload: InterviewReportPayload) => {
    if (payload.finalReport) {
      setReport({
        summary: payload.finalReport.summary,
        strengths: payload.finalReport.strengths ?? [],
        knowledgeGaps: payload.finalReport.knowledgeGaps ?? [],
        improvedAnswers: payload.finalReport.improvedAnswers ?? [],
        nextSteps: payload.finalReport.nextSteps ?? [],
        overallScore: payload.overallScore
      });
    }
    setActiveSessionId(null);
    setCurrentQuestion(null);
  }, []);

  const beginSession = useCallback(
    async (input: { targetRole: string; interviewType: InterviewType; difficulty: InterviewDifficulty; questionCount: number }) => {
      setError(null);
      setStarting(true);
      setReport(null);
      setLastEvaluation(null);
      try {
        const created = await createInterview(input);
        const first = await startInterview(created.sessionId);
        setActiveSessionId(created.sessionId);
        setCurrentQuestion(first);
        return true;
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Failed to start the interview');
        return false;
      } finally {
        setStarting(false);
      }
    },
    []
  );

  const submitAnswer = useCallback(
    async (answer: string): Promise<boolean> => {
      if (!activeSessionId || submitting) return false;
      setSubmitting(true);
      setError(null);
      try {
        const result = await answerInterview(activeSessionId, answer);
        setLastEvaluation(result.evaluation ?? null);
        setCurrentQuestion(result.status === 'IN_PROGRESS' ? result : null);
        if (result.status !== 'IN_PROGRESS') {
          // Last question answered — complete automatically.
          const finished = await completeInterview(activeSessionId);
          applyReport(finished);
          void refreshHistory();
        }
        return true;
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Failed to submit the answer');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, submitting, refreshHistory]
  );

  const loadSessionReport = useCallback(async (sessionId: string) => {
    setError(null);
    try {
      const detail = await fetchInterview(sessionId);
      if (detail.finalReport) {
        setReport({
          summary: detail.finalReport.summary,
          strengths: detail.finalReport.strengths ?? [],
          knowledgeGaps: detail.finalReport.knowledgeGaps ?? [],
          improvedAnswers: detail.finalReport.improvedAnswers ?? [],
          nextSteps: detail.finalReport.nextSteps ?? [],
          overallScore: detail.overallScore ?? 0
        });
        return true;
      }
      setError('This interview has no report yet');
      return false;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load the report');
      return false;
    }
  }, []);

  const removeSession = useCallback(
    async (sessionId: string) => {
      try {
        await import('../services/interviewService').then((m) => m.deleteInterview(sessionId));
        void refreshHistory();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Failed to delete the session');
      }
    },
    [refreshHistory]
  );

  const reset = useCallback(() => {
    setActiveSessionId(null);
    setCurrentQuestion(null);
    setLastEvaluation(null);
    setReport(null);
    setError(null);
  }, []);

  return {
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
    reset,
    refreshHistory
  };
}
