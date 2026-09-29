/** Growth controllers (Phase 5 §17, §32 — IDOR-safe). */
import type { Request, Response } from 'express';

import { GrowthJob } from '../models/GrowthJob.js';
import { asyncHandler, ok } from '../utils/api.js';
import { badRequest, notFound, unauthorized } from '../utils/errors.js';
import { PythonServiceError } from '../utils/pythonClient.js';
import {
  fetchGaps,
  fetchOutdatedState,
  fetchProject,
  fetchProjects,
  fetchRoles,
  fetchRoadmap,
  regenerateRoadmap,
  startGrowthAnalysis,
  updatePhaseProgress,
  type PhaseStatus,
  type RoadmapDTO
} from '../services/growthService.js';

function requireUserId(req: Request): string {
  if (!req.user) throw unauthorized('Authentication required');
  return String(req.user._id);
}

/** GET /api/growth/roles — supported target roles + matrices (§1, §2). */
export const listRoles = asyncHandler(async (_req: Request, res: Response) => {
  const { roles } = await fetchRoles();
  ok(res, { roles });
});

/** POST /api/growth/analyze — queue a growth analysis for a target role (§17). */
export const analyze = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const targetRole = String(req.body?.targetRole ?? '').trim();
  if (!targetRole) {
    throw badRequest('A target role is required — select the role you are targeting (§36)');
  }
  const { job, reused } = await startGrowthAnalysis(userId, targetRole);
  ok(
    res,
    {
      jobId: String(job._id),
      status: job.status,
      targetRole,
      reused
    },
    reused ? 'Growth analysis already running' : 'Growth analysis started',
    202
  );
});

/** GET /api/growth/status/:jobId — poll one growth job (ownership-checked). */
export const jobStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const job = await GrowthJob.findOne({ _id: String(req.params.jobId), userId });
  if (!job) throw notFound('Growth job not found');
  ok(res, {
    id: String(job._id),
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    targetRole: job.targetRole,
    gapsFound: job.gapsFound,
    roadmapVersion: job.roadmapVersion,
    projectsGenerated: job.projectsGenerated,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  });
});

/** GET /api/growth/gaps — stored gaps for the current target role. */
export const getGaps = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const targetRole = String(req.body?.targetRole ?? req.query.targetRole ?? '').trim();
  if (!targetRole) throw badRequest('targetRole is required — run the growth analysis first');

  try {
    const data = await fetchGaps(userId, targetRole);
    ok(res, data);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) throw notFound('No skill gap analysis found — run the growth analysis first');
    throw error;
  }
});

/** GET /api/growth/roadmap — the user's roadmap (current or per-role). */
export const getRoadmap = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const targetRole = String(req.body?.targetRole ?? req.query.targetRole ?? '').trim();

  try {
    const roadmap = await fetchRoadmap(userId, targetRole);
    ok(res, roadmap);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) throw notFound('No roadmap yet — run the growth analysis first');
    throw error;
  }
});

/** POST /api/growth/roadmap/regenerate — new roadmap version (§28, §29). */
export const regenerate = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const targetRole =
    String(req.body?.targetRole ?? '').trim() || String(req.user?.targetRole ?? '').trim();
  if (!targetRole) throw badRequest('targetRole is required');

  try {
    const result = await regenerateRoadmap(userId, targetRole);
    ok(res, result);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) {
      throw notFound('Nothing to regenerate yet — run the growth analysis first');
    }
    throw error;
  }
});

/** GET /api/growth/projects — stored project recommendations. */
export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const targetRole = String(req.body?.targetRole ?? req.query.targetRole ?? '').trim();

  try {
    const { projects } = await fetchProjects(userId, targetRole);
    ok(res, { projects });
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) throw notFound('No project recommendations yet — run the growth analysis first');
    throw error;
  }
});

/** GET /api/growth/projects/:id — one recommendation (IDOR-safe via Python ownership query). */
export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const projectId = String(req.params.id);
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw notFound('Project recommendation not found');

  try {
    const project = await fetchProject(userId, projectId);
    ok(res, project);
  } catch (error) {
    if (error instanceof PythonServiceError && error.status === 404) throw notFound('Project recommendation not found');
    throw error;
  }
});

/** GET /api/growth/outdated — DNA-changed detection for the banner (§28). */
export const getOutdated = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  try {
    const state = await fetchOutdatedState(userId);
    ok(res, state);
  } catch (error) {
    // Non-critical banner: degrade gracefully whether Python reports "no
    // analysis yet" (404) or is temporarily unavailable (5xx/network).
    if (error instanceof PythonServiceError) {
      ok(res, { outdated: false, profileUpdatedAt: null, roadmapGeneratedAt: null });
    } else {
      throw error;
    }
  }
});

/** PATCH /api/growth/roadmap/progress — manual phase progress (§30). */
export const patchProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  if (updates.length === 0) throw badRequest('updates array is required');
  const allowed: PhaseStatus[] = ['LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED'];
  for (const upd of updates) {
    if (!upd?.phaseId || !allowed.includes(upd.status)) {
      throw badRequest('Each update needs phaseId and status (LOCKED|AVAILABLE|IN_PROGRESS|COMPLETED)');
    }
  }

  const targetRole = String(req.body?.targetRole ?? '').trim();
  const roadmap = (await fetchRoadmap(userId, targetRole)) as RoadmapDTO;
  const updated = await updatePhaseProgress(userId, roadmap.targetRole, roadmap, updates);
  ok(res, updated);
});
