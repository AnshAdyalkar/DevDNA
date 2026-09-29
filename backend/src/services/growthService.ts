/**
 * Growth service (Phase 5) — Node-side orchestration.
 *
 * Node authorizes the user, manages the growth job lifecycle and Socket.IO
 * progress events (§19, §20); Python computes gaps/roadmap/projects and
 * stores them (§18). The selected target role is persisted on the User
 * document (§16). Ownership is enforced on every query (§32).
 */
import { Types } from 'mongoose';

import { GrowthJob, type GrowthJobDocument } from '../models/GrowthJob.js';
import { RoadmapProgress, type PhaseStatus } from '../models/RoadmapProgress.js';
import { User } from '../models/User.js';

export type { PhaseStatus };
import { HttpError } from '../utils/errors.js';
import { pythonGet, pythonPost } from '../utils/pythonClient.js';
import { logger } from '../utils/logger.js';
import { emitToUser } from '../sockets/index.js';

const STEP_WEIGHTS: Record<string, number> = {
  QUEUED: 4,
  CALCULATING_GAPS: 36,
  BUILDING_DEPENDENCIES: 20,
  GENERATING_ROADMAP: 25,
  GENERATING_PROJECTS: 10,
  COMPLETED: 5
};

function progressForStep(step: string): number {
  const keys = Object.keys(STEP_WEIGHTS);
  const idx = keys.indexOf(step);
  if (idx < 0) return 0;
  const base = keys.slice(0, idx).reduce((sum, k) => sum + (STEP_WEIGHTS[k] ?? 0), 0);
  return Math.min(99, base + Math.floor((STEP_WEIGHTS[step] ?? 0) / 2));
}

export interface GrowthAnalyzeSummary {
  targetRole: string;
  analysisVersion: string;
  gapsFound: number;
  roadmapGenerated: boolean;
  roadmapVersion: number;
  projectsGenerated: number;
}

interface PythonGrowthAnalyzeResponse {
  targetRole: string;
  analysisVersion: string;
  gapsFound: number;
  roadmapGenerated: boolean;
  roadmapVersion: number;
  projectsGenerated: number;
}

/** The active (unfinished) growth job for a user, if any. */
export async function findActiveGrowthJob(userId: string): Promise<GrowthJobDocument | null> {
  return GrowthJob.findOne({
    userId: new Types.ObjectId(userId),
    status: {
      $in: ['QUEUED', 'RUNNING', 'CALCULATING_GAPS', 'BUILDING_DEPENDENCIES', 'GENERATING_ROADMAP', 'GENERATING_PROJECTS']
    }
  });
}

/** Persist the selected target role on the user (§16). */
export async function setTargetRole(userId: string, targetRole: string): Promise<void> {
  await User.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { targetRole } });
}

/** Create a job and kick off the Python growth pipeline in the background. */
export async function startGrowthAnalysis(
  userId: string,
  targetRole: string
): Promise<{ job: GrowthJobDocument; reused: boolean }> {
  const active = await findActiveGrowthJob(userId);
  if (active) return { job: active, reused: true };

  await setTargetRole(userId, targetRole);

  const job = await GrowthJob.create({
    userId,
    targetRole,
    status: 'QUEUED',
    progress: progressForStep('QUEUED'),
    currentStep: 'Queued'
  });
  // Fire-and-forget, but failure-proof: job writes use deletion-tolerant
  // updateOne calls so a removed job can never surface an unhandled error.
  runGrowthAnalysis(String(job._id), userId, targetRole).catch(() => undefined);
  return { job, reused: false };
}

/** Run the Python growth pipeline and keep the job in sync (§19). */
async function runGrowthAnalysis(jobId: string, userId: string, targetRole: string): Promise<void> {
  let job: GrowthJobDocument | null = null;
  try {
    job = await GrowthJob.findById(jobId);
    if (!job) return;

    const setStep = async (step: string) => {
      // Deletion-tolerant writes: a job removed mid-run (cleanup, restart
      // recovery) must never crash this pipeline.
      await GrowthJob.updateOne(
        { _id: jobId },
        {
          $set: {
            status: step,
            progress: progressForStep(step),
            currentStep: step
          }
        }
      );
      emitToUser(userId, 'growth:analysis:progress', {
        jobId,
        progress: progressForStep(step),
        currentStep: step
      });
    };

    await GrowthJob.updateOne(
      { _id: jobId },
      { $set: { status: 'RUNNING', startedAt: new Date() } }
    );
    emitToUser(userId, 'growth:analysis:started', { jobId, targetRole });

    await setStep('CALCULATING_GAPS');
    await setStep('BUILDING_DEPENDENCIES');

    // Python loads the Developer DNA, computes gaps + dependency-ordered
    // roadmap + projects, and persists them. One internal call.
    const response = await pythonPost<{ userId: string; targetRole: string }, PythonGrowthAnalyzeResponse>(
      '/api/growth/analyze',
      { userId, targetRole },
      60_000
    );

    await setStep('GENERATING_ROADMAP');
    await setStep('GENERATING_PROJECTS');

    await GrowthJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'COMPLETED',
          progress: 100,
          currentStep: 'Completed',
          gapsFound: response.gapsFound,
          roadmapVersion: response.roadmapVersion,
          projectsGenerated: response.projectsGenerated,
          resultSummary: { ...response },
          completedAt: new Date()
        }
      }
    );

    emitToUser(userId, 'growth:analysis:completed', {
      jobId,
      progress: 100,
      targetRole: response.targetRole,
      gapsFound: response.gapsFound,
      roadmapVersion: response.roadmapVersion,
      projectsGenerated: response.projectsGenerated
    });
    logger.info('[GROWTH] Analysis completed', {
      jobId,
      role: response.targetRole,
      gaps: response.gapsFound
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Growth analysis failed unexpectedly';
    const friendly = /Developer DNA|Unsupported target role|No skill gap/i.test(message)
      ? message
      : 'Growth analysis failed — please try again';
    try {
      await GrowthJob.updateOne(
        { _id: jobId },
        { $set: { status: 'FAILED', error: friendly, completedAt: new Date() } }
      );
    } catch {
      // The job record is gone — nothing left to update.
    }
    emitToUser(userId, 'growth:analysis:failed', { jobId, error: friendly });
    logger.warn('[GROWTH] Analysis failed', { jobId, message });
  }
}

/** Recover growth jobs interrupted by a server restart. */
export async function recoverStaleGrowthJobs(): Promise<void> {
  const result = await GrowthJob.updateMany(
    {
      status: {
        $in: ['QUEUED', 'RUNNING', 'CALCULATING_GAPS', 'BUILDING_DEPENDENCIES', 'GENERATING_ROADMAP', 'GENERATING_PROJECTS']
      }
    },
    { $set: { status: 'FAILED', error: 'Interrupted by server restart — start a new analysis' } }
  );
  if (result.modifiedCount > 0) {
    logger.warn(`Marked ${result.modifiedCount} interrupted growth job(s) as failed`);
  }
}

// ─── Python proxies (§17, §18) ──────────────────────────────────────────────

export interface RoleMatrixDTO {
  role: string;
  description: string;
  skills: { name: string; importance: number; requiredLevel: number }[];
}

export async function fetchRoles(): Promise<{ roles: RoleMatrixDTO[] }> {
  return pythonGet<{ roles: RoleMatrixDTO[] }>('/api/growth/roles');
}

export interface SkillGapDTO {
  skill: string;
  requiredLevel: number;
  currentScore: number | null;
  confidence: number | null;
  gap: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityScore: number;
  kind: 'demonstrated' | 'limited_evidence' | 'not_detected';
  evidence: string[];
  dependencies: string[];
}

export interface GapsDTO {
  targetRole: string;
  analysisVersion: string;
  gaps: SkillGapDTO[];
  strengths: string[];
}

export async function fetchGaps(userId: string, targetRole: string): Promise<GapsDTO> {
  return pythonPost<{ userId: string; targetRole: string }, GapsDTO>('/api/growth/gaps', {
    userId,
    targetRole
  });
}

export interface RoadmapPhaseDTO {
  id: string;
  order: number;
  title: string;
  description: string;
  skills: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  prerequisites: string[];
  estimatedDuration: string;
  learningObjectives: string[];
  resources: { name: string; type: string; url?: string | null }[];
  project: string | null;
  completed: boolean;
  progressStatus?: PhaseStatus;
}

export interface RoadmapDTO {
  _id: string;
  userId: string;
  targetRole: string;
  version: number;
  analysisVersion: string;
  status: string;
  generatedAt: string;
  updatedAt: string;
  estimatedDuration: string;
  phases: RoadmapPhaseDTO[];
}

export async function fetchRoadmap(userId: string, targetRole: string): Promise<RoadmapDTO> {
  return pythonPost<{ userId: string; targetRole: string }, RoadmapDTO>('/api/growth/roadmap', {
    userId,
    targetRole
  });
}

export interface ProjectDTO {
  _id: string;
  userId: string;
  targetRole: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedDuration: string;
  technologies: string[];
  skillsDeveloped: string[];
  gapsAddressed: string[];
  prerequisites: string[];
  architecture: string | null;
  milestones: { order: number; title: string; description: string; skills: string[]; estimatedDuration: string }[];
  generatedAt: string;
  analysisVersion: string;
}

export async function fetchProjects(userId: string, targetRole: string): Promise<{ projects: ProjectDTO[] }> {
  return pythonPost<{ userId: string; targetRole: string }, { projects: ProjectDTO[] }>('/api/growth/projects', {
    userId,
    targetRole
  });
}

export async function fetchProject(userId: string, projectId: string): Promise<ProjectDTO> {
  return pythonPost<{ userId: string; targetRole: string }, ProjectDTO>(
    `/api/growth/projects/${projectId}`,
    { userId, targetRole: '' }
  );
}

/** Explicit roadmap regeneration — creates the next version (§28, §29). */
export async function regenerateRoadmap(
  userId: string,
  targetRole: string
): Promise<{ roadmapVersion: number; summary: GrowthAnalyzeSummary }> {
  return pythonPost<{ userId: string; targetRole: string }, { roadmapVersion: number; summary: GrowthAnalyzeSummary }>(
    '/api/growth/roadmap/regenerate',
    { userId, targetRole },
    60_000
  );
}

/** Should the user be nudged to regenerate? (§28) */
export async function fetchOutdatedState(
  userId: string
): Promise<{ outdated: boolean; profileUpdatedAt: string | null; roadmapGeneratedAt: string | null }> {
  return pythonPost<{ userId: string }, { outdated: boolean; profileUpdatedAt: string | null; roadmapGeneratedAt: string | null }>(
    '/api/growth/outdated',
    { userId }
  );
}

/**
 * Update roadmap phase progress (§30). The statuses live in Mongo
 * (RoadmapProgress) AND are stamped onto the Python roadmap phases so the
 * UI reads a single consistent document.
 */
export async function updatePhaseProgress(
  userId: string,
  targetRole: string,
  roadmap: RoadmapDTO,
  updates: { phaseId: string; status: PhaseStatus }[]
): Promise<RoadmapDTO> {
  const byId = new Map(roadmap.phases.map((p) => [p.id, p]));

  for (const upd of updates) {
    const phase = byId.get(upd.phaseId);
    if (!phase) throw new HttpError(422, 'UNKNOWN_PHASE', `Unknown phase: ${upd.phaseId}`);
    phase.progressStatus = upd.status;
    phase.completed = upd.status === 'COMPLETED';
    const match = {
      userId: new Types.ObjectId(userId),
      roadmapVersion: roadmap.version,
      targetRole,
      phaseId: upd.phaseId
    };
    if (upd.status === 'IN_PROGRESS') {
      await RoadmapProgress.updateOne(
        match,
        {
          $set: { status: 'IN_PROGRESS', startedAt: new Date(), completedAt: undefined },
          $setOnInsert: { roadmapId: roadmap._id, analysisVersion: roadmap.analysisVersion }
        },
        { upsert: true }
      );
    }
    if (upd.status === 'COMPLETED') {
      await RoadmapProgress.updateOne(
        match,
        {
          $set: { status: 'COMPLETED', completedAt: new Date() },
          $setOnInsert: { roadmapId: roadmap._id, analysisVersion: roadmap.analysisVersion }
        },
        { upsert: true }
      );
    }
    if (upd.status === 'AVAILABLE' || upd.status === 'LOCKED') {
      // Resetting: drop IN_PROGRESS/COMPLETED records so the phase is clean.
      await RoadmapProgress.deleteMany({ ...match, status: { $in: ['IN_PROGRESS', 'COMPLETED'] } });
    }
  }

  const payload = {
    userId,
    updates: updates.map((u) => ({ phaseId: u.phaseId, status: u.status }))
  };
  return pythonPost<typeof payload, RoadmapDTO>('/api/growth/progress', payload);
}
