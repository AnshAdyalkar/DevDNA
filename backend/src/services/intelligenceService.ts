/**
 * Intelligence service (Phase 4 §24) — Node-side orchestration.
 *
 * Responsibilities: create analysis jobs, call the Python engine with the
 * internal key, update job status/progress, emit Socket.IO events, handle
 * timeouts and honest failures. Python owns all analysis math.
 */
import { Types } from 'mongoose';

import { AnalysisJob, type AnalysisJobDocument } from '../models/AnalysisJob.js';
import { GitHubSyncJob } from '../models/GitHubSyncJob.js';
import { Repository } from '../models/Repository.js';
import { HttpError } from '../utils/errors.js';
import { pythonPost } from '../utils/pythonClient.js';
import { logger } from '../utils/logger.js';
import { emitToUser } from '../sockets/index.js';

const STEP_WEIGHTS: Record<string, number> = {
  QUEUED: 2,
  FETCHING_DATA: 10,
  ANALYZING_REPOSITORIES: 55,
  CALCULATING_SKILLS: 15,
  GENERATING_DNA: 13,
  COMPLETED: 5
};

function progressForStep(step: string): number {
  const keys = Object.keys(STEP_WEIGHTS);
  const idx = keys.indexOf(step);
  if (idx < 0) return 0;
  const base = keys.slice(0, idx).reduce((sum, k) => sum + (STEP_WEIGHTS[k] ?? 0), 0);
  return Math.min(99, base + Math.floor((STEP_WEIGHTS[step] ?? 0) / 2));
}

export interface AnalyzeSummary {
  userId: string;
  status: string;
  repositoriesAnalyzed: number;
  repositoriesReanalyzed?: number;
  repositoriesCached?: number;
  skillsDetected: number;
  analysisVersion: string;
  analyzedAt?: string;
}

interface PythonAnalyzeResponse {
  summary: AnalyzeSummary;
  profile: Record<string, unknown>;
}

/** The active (unfinished) analysis job for a user, if any. */
export async function findActiveJob(userId: string): Promise<AnalysisJobDocument | null> {
  return AnalysisJob.findOne({
    userId: new Types.ObjectId(userId),
    status: { $in: ['QUEUED', 'RUNNING', 'FETCHING_DATA', 'ANALYZING_REPOSITORIES', 'CALCULATING_SKILLS', 'GENERATING_DNA'] }
  });
}

/**
 * Create a job and kick off the Python pipeline in the background.
 * Precondition (checked here, enforced again in Python): the user has
 * synchronized repositories — otherwise we fail honestly (§29).
 */
export async function startAnalysis(userId: string): Promise<{ job: AnalysisJobDocument; reused: boolean }> {
  const active = await findActiveJob(userId);
  if (active) return { job: active, reused: true };

  const repoCount = await Repository.countDocuments({ userId: new Types.ObjectId(userId) });
  if (repoCount === 0) {
    throw new HttpError(
      422,
      'NO_ANALYSIS_DATA',
      'Not enough data for analysis — connect GitHub and sync repositories first'
    );
  }

  const job = await AnalysisJob.create({
    userId,
    status: 'QUEUED',
    progress: progressForStep('QUEUED'),
    currentStep: 'Queued'
  });
  // Fire-and-forget, but failure-proof: job writes use deletion-tolerant
  // updateOne calls so a removed job can never surface an unhandled error.
  runAnalysis(String(job._id), userId, repoCount).catch(() => undefined);
  return { job, reused: false };
}

/** Run the Python analysis and keep the job in sync. */
async function runAnalysis(jobId: string, userId: string, repositoriesTotal: number): Promise<void> {
  const setStep = async (step: string, extra: Partial<AnalysisJobDocument> = {}) => {
    await AnalysisJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: step,
          progress: progressForStep(step),
          currentStep: step,
          ...extra
        }
      }
    );
    emitToUser(userId, 'intelligence:analysis:progress', {
      jobId,
      progress: progressForStep(step),
      currentStep: step,
      repositoriesTotal
    });
  };

  try {
    await AnalysisJob.updateOne(
      { _id: jobId },
      { $set: { status: 'RUNNING', startedAt: new Date() } }
    );
    emitToUser(userId, 'intelligence:analysis:started', { jobId });

    await setStep('FETCHING_DATA');
    await setStep('ANALYZING_REPOSITORIES', { repositoriesTotal });

    // Python does the heavy lifting in one call; it reads the same Mongo data.
    // Generous timeout: large repository sets take minutes, not seconds.
    const response = await pythonPost<Record<string, never>, PythonAnalyzeResponse>(
      '/api/intelligence/analyze/user/' + userId,
      {} as Record<string, never>,
      5 * 60_000
    );

    await setStep('CALCULATING_SKILLS');
    await setStep('GENERATING_DNA');

    const summary = response.summary ?? (response as unknown as AnalyzeSummary);
    await AnalysisJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'COMPLETED',
          progress: 100,
          currentStep: 'Completed',
          skillsDetected: summary.skillsDetected,
          repositoriesProcessed: summary.repositoriesAnalyzed,
          resultSummary: {
            repositoriesAnalyzed: summary.repositoriesAnalyzed,
            repositoriesReanalyzed: summary.repositoriesReanalyzed,
            repositoriesCached: summary.repositoriesCached,
            skillsDetected: summary.skillsDetected,
            analysisVersion: summary.analysisVersion,
            analyzedAt: summary.analyzedAt
          },
          completedAt: new Date()
        }
      }
    );

    emitToUser(userId, 'intelligence:analysis:completed', {
      jobId,
      progress: 100,
      skillsDetected: summary.skillsDetected,
      repositoriesAnalyzed: summary.repositoriesAnalyzed
    });
    logger.info('[INTELLIGENCE] Analysis completed', { jobId, skills: summary.skillsDetected });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analysis failed unexpectedly';
    const friendly = message.includes('Not enough data')
      ? message
      : 'Analysis failed — please try again';
    try {
      await AnalysisJob.updateOne(
        { _id: jobId },
        { $set: { status: 'FAILED', error: friendly, completedAt: new Date() } }
      );
    } catch {
      // The job record is gone — nothing left to update.
    }
    emitToUser(userId, 'intelligence:analysis:failed', { jobId, error: friendly });
    logger.warn('[INTELLIGENCE] Analysis failed', { jobId, message });
  }
}

/** Recover jobs interrupted by a server restart. */
export async function recoverStaleAnalysisJobs(): Promise<void> {
  const result = await AnalysisJob.updateMany(
    { status: { $in: ['QUEUED', 'RUNNING', 'FETCHING_DATA', 'ANALYZING_REPOSITORIES', 'CALCULATING_SKILLS', 'GENERATING_DNA'] } },
    { $set: { status: 'FAILED', error: 'Interrupted by server restart — start a new analysis' } }
  );
  if (result.modifiedCount > 0) {
    logger.warn(`Marked ${result.modifiedCount} interrupted analysis job(s) as failed`);
  }
}

/** Public profile shape for the frontend (via GET /api/intelligence/dna). */
export interface DeveloperProfileDTO {
  analysisVersion: string;
  analyzedAt: string;
  updatedAt: string;
  repositoriesAnalyzed: number;
  primaryLanguages: { name: string; bytes: number; percentage: number }[];
  technologies: string[];
  projectTypes: { projectType: string; confidence: number; evidence: string[] }[];
  skills: {
    skill: string;
    score: number;
    confidence: number;
    evidence: { type: string; value: string }[];
    updatedAt: string;
  }[];
  behavior: { observations: string[]; metrics: Record<string, unknown> };
  engineeringPractices: Record<string, unknown>;
  summaryMetrics: Record<string, unknown>;
}

export async function fetchProfile(userId: string): Promise<DeveloperProfileDTO> {
  return pythonPost<Record<string, never>, { profile: DeveloperProfileDTO }>(
    '/api/intelligence/profile/user/' + userId,
    {} as Record<string, never>
  ).then((r) => r.profile);
}

export async function fetchRepositoryAnalyses(userId: string): Promise<{ repositories: Record<string, unknown>[] }> {
  return pythonPost<Record<string, never>, { repositories: Record<string, unknown>[] }>(
    '/api/intelligence/repositories/user/' + userId,
    {} as Record<string, never>
  );
}

export async function fetchRepositoryAnalysis(
  userId: string,
  repositoryId: string
): Promise<Record<string, unknown>> {
  return pythonPost<{ userId: string; repositoryId: string }, Record<string, unknown>>(
    `/api/intelligence/repositories/user/${userId}/${repositoryId}`,
    { userId, repositoryId }
  );
}

/** Guard used by routes: an unfinished sync makes analysis premature. */
export async function ensureSyncSettled(userId: string): Promise<void> {
  const syncing = await GitHubSyncJob.findOne({
    userId: new Types.ObjectId(userId),
    status: { $in: ['QUEUED', 'RUNNING'] }
  });
  if (syncing) {
    throw new HttpError(409, 'SYNC_IN_PROGRESS', 'A GitHub sync is still running — wait for it to finish');
  }
}
