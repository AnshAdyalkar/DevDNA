/**
 * Interview controller — create, list, start, answer, complete, delete (§13).
 * Same error mapping as the AI controller: configuration problems surface as
 * a clear 503, never as fake interview content.
 */
import type { Request, Response } from 'express';

import { AINotConfiguredError, AIStructuredOutputError } from '../services/ai/index.js';
import { MAX_ANSWER_LENGTH } from '../services/interviewService.js';
import {
  answerInterviewQuestion,
  completeInterviewSession,
  createInterviewSession,
  deleteInterviewSessionForUser,
  getInterviewSessionForUser,
  listInterviewSessionsForUser,
  startInterviewSession
} from '../services/interviewService.js';
import { asyncHandler, ok } from '../utils/api.js';
import { badRequest, notFound, serviceUnavailable, unauthorized } from '../utils/errors.js';

function requireUserId(req: Request): string {
  if (!req.user) throw unauthorized('Authentication required');
  return String(req.user._id);
}

function mapAIError(error: unknown): never {
  if (error instanceof AINotConfiguredError) {
    throw serviceUnavailable(error.message);
  }
  if (error instanceof AIStructuredOutputError) {
    throw serviceUnavailable('The AI response could not be validated — please try again');
  }
  throw error;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const payload = req.body ?? {};

  try {
    const session = await createInterviewSession(userId, {
      targetRole: payload.targetRole,
      interviewType: payload.interviewType,
      difficulty: payload.difficulty,
      questionCount: payload.questionCount
    });
    ok(res, session);
  } catch (error) {
    if (error instanceof AINotConfiguredError) throw serviceUnavailable(error.message);
    throw error;
  }
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessions = await listInterviewSessionsForUser(userId);
  ok(res, { sessions });
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessionId = String(req.params.sessionId);
  const session = await getInterviewSessionForUser(userId, sessionId);

  if (!session) throw notFound('Interview session not found');
  ok(res, { session });
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessionId = String(req.params.sessionId);
  try {
    const session = await startInterviewSession(userId, sessionId);
    ok(res, session);
  } catch (error) {
    mapAIError(error);
  }
});

export const answer = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessionId = String(req.params.sessionId);
  const answer = String(req.body?.answer ?? '').trim();

  if (!answer) throw badRequest('Answer is required');
  if (answer.length > MAX_ANSWER_LENGTH) {
    throw badRequest(`Answer is too long (max ${MAX_ANSWER_LENGTH} characters)`);
  }

  try {
    const result = await answerInterviewQuestion(userId, sessionId, answer);
    ok(res, result);
  } catch (error) {
    mapAIError(error);
  }
});

export const complete = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessionId = String(req.params.sessionId);
  try {
    const result = await completeInterviewSession(userId, sessionId);
    ok(res, result);
  } catch (error) {
    mapAIError(error);
  }
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const sessionId = String(req.params.sessionId);
  const deleted = await deleteInterviewSessionForUser(userId, sessionId);
  if (!deleted) throw notFound('Interview session not found');
  ok(res, { deleted: true, sessionId });
});
