/** Intelligence controllers (Phase 4 §22, §25, §40 — IDOR-safe). */
import type { Request, Response } from 'express';

import { AnalysisJob } from '../models/AnalysisJob.js';
import { asyncHandler, ok } from '../utils/api.js';
import { notFound, unauthorized } from '../utils/errors.js';
import {
  fetchProfile,
  fetchRepositoryAnalyses,
  fetchRepositoryAnalysis,
  startAnalysis
} from '../services/intelligenceService.js';
import { PythonServiceError } from '../utils/pythonClient.js';

function requireUserId(req: Request): string {
  if (!req.user) throw unauthorized('Authentication required');
  return String(req.user._id);
}

/** POST /api/intelligence/analyze — queue a Developer DNA analysis. */
export const analyze = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { job, reused } = await startAnalysis(userId);
  ok(
    res,
    {
      jobId: String(job._id),
      status: job.status,
      reused
    },
    reused ? 'Analysis already running' : 'Analysis started',
    202
  );
});

/** GET /api/intelligence/status/:jobId — poll one job (ownership-checked). */
export const jobStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const jobId = String(req.params.jobId);
  const job = await AnalysisJob.findOne({ _id: jobId, userId });
  if (!job) throw notFound('Analysis job not found');
  ok(res, {
    id: String(job._id),
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    repositoriesTotal: job.repositoriesTotal,
    repositoriesProcessed: job.repositoriesProcessed,
    skillsDetected: job.skillsDetected,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  });
});

/** GET /api/intelligence/jobs — latest job for the current user. */
export const latestJob = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const job = await AnalysisJob.findOne({ userId }).sort({ createdAt: -1 });
  ok(res, {
    job: job
      ? {
          id: String(job._id),
          status: job.status,
          progress: job.progress,
          currentStep: job.currentStep,
          skillsDetected: job.skillsDetected,
          error: job.error,
          completedAt: job.completedAt
        }
      : null
  });
});

/** GET /api/intelligence/dna — the stored DeveloperProfile. */
export const getDna = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  try {
    const profile = await fetchProfile(userId);
    ok(res, profile);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) {
      throw notFound('No Developer DNA analysis found — run an analysis first');
    }
    throw error;
  }
});

/** GET /api/intelligence/repositories — stored per-repo analyses. */
export const listRepositoryAnalyses = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { repositories } = await fetchRepositoryAnalyses(userId);
  ok(res, { repositories });
});

/** GET /api/intelligence/repositories/:id — one repo analysis (IDOR-safe). */
export const getRepositoryAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const repositoryId = String(req.params.id);
  try {
    const doc = await fetchRepositoryAnalysis(userId, repositoryId);
    ok(res, doc);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) {
      throw notFound('Repository analysis not found');
    }
    throw error;
  }
});
