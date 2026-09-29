/**
 * AI Interviewer service (§13).
 *
 * Flow: create (role/type/difficulty/count) → start (LLM drafts the first
 * personalized question from the DevDNA context) → answer (LLM evaluates and
 * picks the next question, adapting difficulty and follow-ups) → complete
 * (final report with strengths, knowledge gaps and improved answers).
 *
 * Grounding: questions may only reference technologies/skills/projects that
 * exist in the Phase 4/5 context. Evaluations are never hardcoded — without a
 * configured provider the endpoints fail with a clear configuration error.
 */
import mongoose from 'mongoose';
import { z } from 'zod';

import {
  InterviewSession,
  type InterviewDifficulty,
  type InterviewQuestionRecord,
  type InterviewSessionDocument,
  type InterviewType
} from '../models/InterviewSession.js';
import { buildDeveloperAIContext } from './aiContextBuilder.js';
import {
  AINotConfiguredError,
  generateStructured,
  groundingSystemPrompt,
  stripPromptInjection,
  type AIProvider
} from './ai/index.js';
import { createAIProvider } from './ai/providerFactory.js';
import { INTERVIEW_SYSTEM_ADDENDUM, PROMPT_VERSION } from './ai/prompts.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';
import { TARGET_ROLES } from '../../../shared/types.js';

export const MAX_ANSWER_LENGTH = 8000;
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 10;

const questionSchema = z.object({
  question: z.string().min(10).max(2000),
  category: z.string().min(2).max(60),
  expectedConcepts: z.array(z.string().min(1).max(80)).max(8).default([]),
  relatedSkills: z.array(z.string().min(1).max(60)).max(6).default([]),
  relatedRepository: z.string().max(120).optional()
});

const evaluationSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().min(1).max(3000),
  strengths: z.array(z.string().max(300)).max(6).default([]),
  knowledgeGaps: z.array(z.string().max(300)).max(6).default([]),
  improvedAnswer: z.string().min(1).max(3000),
  nextDifficulty: z.enum(['EASY', 'MEDIUM', 'HARD'])
});

const nextQuestionSchema = z.object({
  nextQuestion: questionSchema.omit({ relatedRepository: true }).extend({ relatedRepository: z.string().max(120).optional() }),
  adaptNote: z.string().max(300).default('')
});

const reportSchema = z.object({
  summary: z.string().min(1).max(6000),
  strengths: z.array(z.string().max(300)).max(10).default([]),
  knowledgeGaps: z.array(z.string().max(300)).max(10).default([]),
  improvedAnswers: z
    .array(z.object({ question: z.string().max(2000), suggestion: z.string().max(4000) }))
    .max(10)
    .default([]),
  nextSteps: z.array(z.string().max(400)).max(10).default([])
});

function httpError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

async function requireProvider(): Promise<AIProvider> {
  const provider = createAIProvider();
  if (!provider.isConfigured()) {
    throw new AINotConfiguredError(
      'AI is not configured on this server. Set AI_PROVIDER, AI_API_KEY and AI_MODEL (server-side only) to enable interviews.'
    );
  }
  return provider;
}

function interviewSystemPrompt(): string {
  return groundingSystemPrompt(INTERVIEW_SYSTEM_ADDENDUM);
}

export interface CreateInterviewInput {
  targetRole?: string;
  interviewType?: InterviewType;
  difficulty?: InterviewDifficulty;
  questionCount?: number;
}

export async function createInterviewSession(userId: string, input: CreateInterviewInput = {}) {
  const targetRole = TARGET_ROLES.includes(input.targetRole as never)
    ? (input.targetRole as string)
    : undefined;
  if (input.targetRole && !targetRole) {
    throw httpError(422, 'UNSUPPORTED_TARGET_ROLE', `Unsupported target role: ${input.targetRole}`);
  }
  const role = targetRole ?? 'Software Engineer';
  const interviewType: InterviewType = (['TECHNICAL', 'PROJECT', 'BEHAVIORAL'] as const).includes(
    input.interviewType as never
  )
    ? (input.interviewType as InterviewType)
    : 'TECHNICAL';
  const difficulty: InterviewDifficulty = (['EASY', 'MEDIUM', 'HARD'] as const).includes(input.difficulty as never)
    ? (input.difficulty as InterviewDifficulty)
    : 'MEDIUM';
  const questionCount = Math.min(Math.max(Math.floor(Number(input.questionCount) || 5), MIN_QUESTIONS), MAX_QUESTIONS);

  const session = await InterviewSession.create({
    userId: new mongoose.Types.ObjectId(userId),
    targetRole: role,
    interviewType,
    difficulty,
    questionCount,
    status: 'NOT_STARTED',
    currentQuestion: 0,
    questions: []
  });

  return {
    sessionId: String(session._id),
    targetRole: session.targetRole,
    interviewType: session.interviewType,
    difficulty: session.difficulty,
    questionCount: session.questionCount,
    status: session.status
  };
}

export async function listInterviewSessionsForUser(userId: string): Promise<unknown[]> {
  return InterviewSession.find({ userId: new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .select('targetRole interviewType difficulty status questionCount currentQuestion overallScore startedAt completedAt createdAt')
    .lean();
}

export async function getInterviewSessionForUser(userId: string, sessionId: string): Promise<unknown> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
  return InterviewSession.findOne({
    _id: new mongoose.Types.ObjectId(sessionId),
    userId: new mongoose.Types.ObjectId(userId)
  }).lean();
}

/** Draft the first personalized question from the developer's real context. */
export async function startInterviewSession(userId: string, sessionId: string) {
  const provider = await requireProvider();
  const session = await InterviewSession.findOne({
    _id: sessionId,
    userId: new mongoose.Types.ObjectId(userId)
  });
  if (!session) throw httpError(404, 'NOT_FOUND', 'Interview session not found');
  if (session.status === 'IN_PROGRESS') {
    return currentQuestionView(session);
  }
  if (session.status !== 'NOT_STARTED') {
    throw httpError(409, 'INTERVIEW_FINISHED', 'This interview has already been completed or cancelled');
  }

  const context = await buildDeveloperAIContext(userId);
  const evidenceSummary = [
    `Target role: ${session.targetRole}`,
    `Interview type: ${session.interviewType}; starting difficulty: ${session.difficulty}`,
    `Technologies with evidence: ${context.technologies.join(', ') || 'none detected'}`,
    `Skills: ${context.dna.skills.map((s) => `${s.skill} (${s.score})`).join(', ') || 'none analyzed'}`,
    `Repositories: ${context.repositories.map((r) => r.name).join(', ') || 'none synced'}`,
    `Skill gaps for the role: ${context.skillGaps.map((g) => `${g.skill} (gap ${g.gap})`).join(', ') || 'none recorded'}`
  ].join('\n');

  const { data } = await generateStructured(
    provider,
    {
      prompt: [
        'Draft the FIRST question of a practice interview for this developer.',
        'The question must be answerable from their actual experience — reference at most one real repository or technology from the context.',
        evidenceSummary,
        '',
        'Return JSON: { question, category, expectedConcepts: string[], relatedSkills: string[], relatedRepository?: string }'
      ].join('\n'),
      systemPrompt: interviewSystemPrompt()
    },
    questionSchema,
    { promptVersion: PROMPT_VERSION }
  );

  const question: InterviewQuestionRecord = {
    question: stripPromptInjection(data.question),
    category: data.category,
    difficulty: session.difficulty,
    expectedConcepts: data.expectedConcepts,
    relatedSkills: data.relatedSkills,
    ...(data.relatedRepository ? { relatedRepositoryId: data.relatedRepository } : {}),
    sourceEvidence: evidenceSummary,
    createdAt: new Date()
  };

  session.status = 'IN_PROGRESS';
  session.currentQuestion = 1;
  session.questions = [question];
  session.startedAt = session.startedAt ?? new Date();
  await session.save();

  return currentQuestionView(session);
}

interface QuestionView {
  sessionId: string;
  status: string;
  currentQuestion: number;
  questionCount: number;
  question: string;
  category: string;
  difficulty: string;
  relatedSkills: string[];
  followUp?: boolean;
  evaluation?: { score: number; feedback: string; strengths: string[]; knowledgeGaps: string[]; improvedAnswer: string };
}

function currentQuestionView(session: InterviewSessionDocument): QuestionView {
  const current = session.questions[session.currentQuestion! - 1];
  return {
    sessionId: String(session._id),
    status: session.status,
    currentQuestion: session.currentQuestion ?? 0,
    questionCount: session.questionCount,
    question: current?.question ?? '',
    category: current?.category ?? '',
    difficulty: current?.difficulty ?? session.difficulty,
    // expectedConcepts intentionally omitted — never leak the grading rubric (§10)
    relatedSkills: current?.relatedSkills ?? []
  };
}

/** Evaluate the current answer, then either follow up adaptively or advance. */
export async function answerInterviewQuestion(userId: string, sessionId: string, rawAnswer: string) {
  const provider = await requireProvider();
  const session = await InterviewSession.findOne({
    _id: sessionId,
    userId: new mongoose.Types.ObjectId(userId)
  });
  if (!session) throw httpError(404, 'NOT_FOUND', 'Interview session not found');
  if (session.status !== 'IN_PROGRESS') {
    throw httpError(409, 'NOT_IN_PROGRESS', 'Interview is not in progress');
  }

  const answer = stripPromptInjection(String(rawAnswer ?? '').trim()).slice(0, MAX_ANSWER_LENGTH);
  if (!answer) throw httpError(400, 'INVALID_REQUEST', 'Answer is required');

  const idx = (session.currentQuestion ?? 1) - 1;
  const current = session.questions[idx];
  if (!current || current.answer) throw httpError(409, 'ALREADY_ANSWERED', 'This question was already answered');

  const priorTurns = session.questions
    .filter((q) => q.answer)
    .slice(-3)
    .map((q) => `Q: ${q.question}\nA: ${stripPromptInjection(q.answer!).slice(0, 600)}`)
    .join('\n\n');

  const { data: evaluation } = await generateStructured(
    provider,
    {
      prompt: [
        'Evaluate this practice-interview answer for the developer.',
        `Question: ${current.question}`,
        `Expected concepts: ${current.expectedConcepts.join(', ') || 'n/a'}`,
        priorTurns ? `Earlier turns (for context only):\n${priorTurns}` : '',
        `Developer answer: ${answer}`,
        '',
        'Ground the evaluation in the developer\'s real DevDNA evidence below — do not assume experience they do not have.',
        `DevDNA context: ${JSON.stringify((await buildDeveloperAIContext(userId)).technologies.concat((await buildDeveloperAIContext(userId)).dna.skills.map((s) => s.skill)))}`,
        '',
        'Return JSON: { score (0-100), feedback, strengths: string[], knowledgeGaps: string[], improvedAnswer, nextDifficulty ("EASY"|"MEDIUM"|"HARD") }'
      ].filter(Boolean).join('\n'),
      systemPrompt: interviewSystemPrompt()
    },
    evaluationSchema,
    { promptVersion: PROMPT_VERSION }
  );

  current.answer = answer;
  current.evaluation = {
    score: evaluation.score,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths,
    knowledgeGaps: evaluation.knowledgeGaps,
    improvedAnswer: evaluation.improvedAnswer,
    evaluatedAt: new Date()
  };

  // Adaptive next step: follow-up on weak answers, otherwise advance (§13).
  const isLastQuestion = session.currentQuestion! >= session.questionCount;
  const weakAnswer = evaluation.score < 60;
  const followUpBudget = session.questions.filter((q) => q.isFollowUp).length;
  const shouldFollowUp = weakAnswer && !isLastQuestion && followUpBudget < 2;

  let nextView: QuestionView;
  if (shouldFollowUp) {
    const { data: next } = await generateStructured(
      provider,
      {
        prompt: [
          'The developer gave a weak answer (score ' + evaluation.score + '/100). Draft ONE adaptive follow-up question that reinforces the fundamentals they missed.',
          `Original question: ${current.question}`,
          `Their answer: ${answer}`,
          `Knowledge gaps identified: ${evaluation.knowledgeGaps.join(', ') || 'none'}`,
          'Keep it based only on technologies/skills in their DevDNA context.',
          '',
          'Return JSON: { question, category, expectedConcepts: string[], relatedSkills: string[] }'
        ].join('\n'),
        systemPrompt: interviewSystemPrompt()
      },
      questionSchema.omit({ relatedRepository: true }).extend({ relatedRepository: z.string().max(120).optional() }),
      { promptVersion: PROMPT_VERSION }
    );
    session.questions.push({
      question: stripPromptInjection(next.question),
      category: next.category,
      difficulty: evaluation.nextDifficulty,
      expectedConcepts: next.expectedConcepts,
      relatedSkills: next.relatedSkills,
      isFollowUp: true,
      createdAt: new Date()
    });
    session.questionCount = Math.min(session.questionCount + 1, MAX_QUESTIONS + 2);
    session.currentQuestion = session.questions.length;
    await session.save();
    nextView = { ...currentQuestionView(session), followUp: true, evaluation };
  } else if (isLastQuestion) {
    // Final answer: close the session. The report itself is generated by the
    // follow-up POST /:id/complete call (idempotent), which the UI issues
    // immediately after receiving a non-IN_PROGRESS answer view.
    session.currentQuestion = session.questions.length;
    session.status = 'COMPLETED';
    session.completedAt = new Date();
    await session.save();
    nextView = { ...currentQuestionView(session), evaluation };
  } else {
    const { data: next } = await generateStructured(
      provider,
      {
        prompt: [
          `The developer answered reasonably well (score ${evaluation.score}/100). Draft the NEXT question, adapting difficulty to ${evaluation.nextDifficulty}.`,
          `Avoid repeating: ${session.questions.map((q) => q.question).slice(-3).join(' | ')}`,
          'Base it on their real technologies/skills/projects from the DevDNA context.',
          '',
          'Return JSON: { question, category, expectedConcepts: string[], relatedSkills: string[], relatedRepository?: string }'
        ].join('\n'),
        systemPrompt: interviewSystemPrompt()
      },
      questionSchema,
      { promptVersion: PROMPT_VERSION }
    );
    session.questions.push({
      question: stripPromptInjection(next.question),
      category: next.category,
      difficulty: evaluation.nextDifficulty,
      expectedConcepts: next.expectedConcepts,
      relatedSkills: next.relatedSkills,
      ...(next.relatedRepository ? { relatedRepositoryId: next.relatedRepository } : {}),
      createdAt: new Date()
    });
    session.currentQuestion = session.questions.length;
    await session.save();
    nextView = { ...currentQuestionView(session), evaluation };
  }

  return nextView;
}

/** Generate the final report and close the session. */
export async function completeInterviewSession(userId: string, sessionId: string) {
  const provider = await requireProvider();
  const session = await InterviewSession.findOne({
    _id: sessionId,
    userId: new mongoose.Types.ObjectId(userId)
  });
  if (!session) throw httpError(404, 'NOT_FOUND', 'Interview session not found');
  // Idempotent: only short-circuit once the report actually exists — a session
  // auto-closed by the final answer still needs its report generated here.
  if (session.status === 'COMPLETED' && session.finalReport) {
    return { sessionId: String(session._id), status: session.status, overallScore: session.overallScore, finalReport: session.finalReport };
  }

  const answered = session.questions.filter((q) => q.answer);
  if (session.status === 'IN_PROGRESS' && answered.length === 0) {
    throw httpError(409, 'NOTHING_TO_EVALUATE', 'Answer at least one question before completing the interview');
  }

  const transcript = answered
    .map(
      (q, i) =>
        `Q${i + 1} (${q.category}, ${q.difficulty}, score ${(q.evaluation as { score?: number } | undefined)?.score ?? 'n/a'}): ${q.question}\nA: ${q.answer}\nFeedback: ${(q.evaluation as { feedback?: string } | undefined)?.feedback ?? ''}`
    )
    .join('\n\n');

  const { data: report, meta } = await generateStructured(
    provider,
    {
      prompt: [
        'Produce the FINAL report for this practice interview.',
        'Practice assessment generated from the developer profile — never a hiring decision or job guarantee (§51).',
        '',
        transcript || 'No questions were answered.',
        '',
        'Return JSON: { summary, strengths: string[], knowledgeGaps: string[], improvedAnswers: [{question, suggestion}], nextSteps: string[] }'
      ].join('\n'),
      systemPrompt: interviewSystemPrompt()
    },
    reportSchema,
    { promptVersion: PROMPT_VERSION }
  );

  session.overallScore = Math.round(
    answered.reduce((total, q) => total + Number((q.evaluation as { score?: number } | undefined)?.score ?? 0), 0) /
      Math.max(answered.length, 1)
  );
  session.finalReport = {
    summary: report.summary,
    strengths: report.strengths,
    knowledgeGaps: report.knowledgeGaps,
    improvedAnswers: report.improvedAnswers,
    nextSteps: report.nextSteps,
    promptVersion: meta.promptVersion,
    provider: meta.provider,
    model: meta.model
  };
  session.status = 'COMPLETED';
  session.completedAt = new Date();
  await session.save();

  return {
    sessionId: String(session._id),
    status: session.status,
    overallScore: session.overallScore,
    finalReport: session.finalReport
  };
}

export async function deleteInterviewSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return false;
  const result = await InterviewSession.deleteOne({
    _id: new mongoose.Types.ObjectId(sessionId),
    userId: new mongoose.Types.ObjectId(userId)
  });
  return result.deletedCount > 0;
}

/** Interview history summary across completed sessions (§13). */
export async function interviewStatsForUser(userId: string) {
  const sessions = await InterviewSession.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: 'COMPLETED'
  })
    .select('overallScore targetRole completedAt')
    .lean();
  const completed = sessions.length;
  const averageScore = completed
    ? Math.round(sessions.reduce((t, s) => t + Number(s.overallScore ?? 0), 0) / completed)
    : null;
  return { completed, averageScore, lastCompletedAt: completed ? sessions[completed - 1]?.completedAt : null };
}
