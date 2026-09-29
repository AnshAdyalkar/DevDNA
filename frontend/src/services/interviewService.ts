/** Interview service — wraps /api/interviews endpoints (Phase 6 §13). */
import { apiDelete, apiGet, apiPost } from './api';

export type InterviewType = 'TECHNICAL' | 'PROJECT' | 'BEHAVIORAL';
export type InterviewDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type InterviewStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface InterviewEvaluation {
  score: number;
  feedback: string;
  strengths?: string[];
  knowledgeGaps?: string[];
  improvedAnswer?: string;
}

export interface InterviewSessionSummary {
  _id: string;
  targetRole: string;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  status: InterviewStatus;
  questionCount: number;
  currentQuestion?: number;
  overallScore?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface InterviewQuestionView {
  question: string;
  category: string;
  difficulty: InterviewDifficulty;
  relatedSkills: string[];
  isFollowUp?: boolean;
  answer?: string;
  evaluation?: Record<string, unknown>;
}

export interface InterviewSessionDetail extends InterviewSessionSummary {
  questions: InterviewQuestionView[];
  finalReport?: {
    summary: string;
    strengths: string[];
    knowledgeGaps: string[];
    improvedAnswers: { question: string; suggestion: string }[];
    nextSteps: string[];
  };
}

export interface InterviewQuestionPayload {
  sessionId: string;
  status: string;
  currentQuestion: number;
  questionCount: number;
  question: string;
  category: string;
  difficulty: string;
  relatedSkills: string[];
  followUp?: boolean;
  evaluation?: InterviewEvaluation;
}

export interface InterviewReportPayload {
  sessionId: string;
  status: string;
  overallScore: number;
  finalReport: NonNullable<InterviewSessionDetail['finalReport']> | undefined;
}

export function createInterview(input: {
  targetRole: string;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  questionCount: number;
}): Promise<{ sessionId: string; status: string }> {
  return apiPost<{ sessionId: string; status: string }>('/interviews', input).then((r) => r.data);
}

export function listInterviews(): Promise<{ sessions: InterviewSessionSummary[] }> {
  return apiGet<{ sessions: InterviewSessionSummary[] }>('/interviews');
}

export function fetchInterview(id: string): Promise<InterviewSessionDetail> {
  return apiGet<InterviewSessionDetail>(`/interviews/${id}`);
}

export function startInterview(id: string): Promise<InterviewQuestionPayload> {
  return apiPost<InterviewQuestionPayload>(`/interviews/${id}/start`).then((r) => r.data);
}

export function answerInterview(id: string, answer: string): Promise<InterviewQuestionPayload> {
  return apiPost<InterviewQuestionPayload>(`/interviews/${id}/answer`, { answer }).then((r) => r.data);
}

export function completeInterview(id: string): Promise<InterviewReportPayload> {
  return apiPost<InterviewReportPayload>(`/interviews/${id}/complete`).then((r) => r.data);
}

export function deleteInterview(id: string): Promise<void> {
  return apiDelete(`/interviews/${id}`).then(() => undefined);
}
