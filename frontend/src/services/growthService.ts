/** Growth service — wraps /api/growth endpoints (Phase 5 §17, §20). */
import { apiGet, apiPatch, apiPost } from './api';

export interface RoleSkillDTO {
  name: string;
  importance: number;
  requiredLevel: number;
}

export interface RoleMatrixDTO {
  role: string;
  description: string;
  skills: RoleSkillDTO[];
}

export interface SkillGap {
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

export interface GapsPayload {
  targetRole: string;
  analysisVersion: string;
  gaps: SkillGap[];
  strengths: string[];
}

export interface ResourceRefDTO {
  name: string;
  type: string;
  url?: string | null;
}

export interface RoadmapPhase {
  id: string;
  order: number;
  title: string;
  description: string;
  skills: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  prerequisites: string[];
  estimatedDuration: string;
  learningObjectives: string[];
  resources: ResourceRefDTO[];
  project: string | null;
  completed: boolean;
  progressStatus?: 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface Roadmap {
  _id: string;
  targetRole: string;
  version: number;
  analysisVersion: string;
  generatedAt: string;
  updatedAt: string;
  estimatedDuration: string;
  phases: RoadmapPhase[];
}

export interface ProjectMilestone {
  order: number;
  title: string;
  description: string;
  skills: string[];
  estimatedDuration: string;
}

export interface ProjectRecommendation {
  _id: string;
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
  milestones: ProjectMilestone[];
  generatedAt: string;
}

export interface GrowthJobInfo {
  id: string;
  status: string;
  progress: number;
  currentStep?: string;
  targetRole?: string;
  gapsFound?: number;
  roadmapVersion?: number;
  projectsGenerated?: number;
  error?: string;
}

// ── API calls ───────────────────────────────────────────────────────────────

export function fetchRoles(): Promise<{ roles: RoleMatrixDTO[] }> {
  return apiGet<{ roles: RoleMatrixDTO[] }>('/growth/roles');
}

export function startGrowthAnalysis(
  targetRole: string
): Promise<{ jobId: string; status: string; targetRole: string; reused: boolean }> {
  return apiPost<{ jobId: string; status: string; targetRole: string; reused: boolean }>(
    '/growth/analyze',
    { targetRole }
  ).then((r) => r.data);
}

export function fetchGrowthJob(jobId: string): Promise<GrowthJobInfo> {
  return apiGet<GrowthJobInfo>(`/growth/status/${jobId}`);
}

export function fetchGaps(targetRole: string): Promise<GapsPayload> {
  return apiGet<GapsPayload>(
    `/growth/gaps?targetRole=${encodeURIComponent(targetRole)}`
  );
}

export function fetchRoadmap(targetRole?: string): Promise<Roadmap> {
  const qs = targetRole ? `?targetRole=${encodeURIComponent(targetRole)}` : '';
  return apiGet<Roadmap>(`/growth/roadmap${qs}`);
}

export function regenerateRoadmap(
  targetRole: string
): Promise<{ roadmapVersion: number }> {
  return apiPost<{ roadmapVersion: number }>('/growth/roadmap/regenerate', {
    targetRole
  }).then((r) => r.data);
}

export function fetchProjects(targetRole?: string): Promise<{ projects: ProjectRecommendation[] }> {
  const qs = targetRole ? `?targetRole=${encodeURIComponent(targetRole)}` : '';
  return apiGet<{ projects: ProjectRecommendation[] }>(`/growth/projects${qs}`);
}

export function fetchProject(id: string): Promise<ProjectRecommendation> {
  return apiGet<ProjectRecommendation>(`/growth/projects/${id}`);
}

export interface OutdatedState {
  outdated: boolean;
  profileUpdatedAt: string | null;
  roadmapGeneratedAt: string | null;
}

export function fetchOutdated(): Promise<OutdatedState> {
  return apiGet<OutdatedState>('/growth/outdated');
}

export function updatePhaseProgress(
  updates: { phaseId: string; status: 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' }[]
): Promise<Roadmap> {
  return apiPatch<Roadmap>('/growth/roadmap/progress', { updates }).then((r) => r.data);
}

// ── Socket.IO progress (§20) — mirrors the DNA service pattern ─────────────

export interface GrowthProgressPayload {
  jobId: string;
  progress: number;
  currentStep?: string;
}

export interface GrowthCompletedPayload {
  jobId: string;
  progress: number;
  targetRole: string;
  gapsFound: number;
  roadmapVersion: number;
  projectsGenerated: number;
}

export interface GrowthFailedPayload {
  jobId: string;
  error: string;
}

type Handlers = {
  onStarted?: () => void;
  onProgress?: (p: GrowthProgressPayload) => void;
  onCompleted?: (p: GrowthCompletedPayload) => void;
  onFailed?: (p: GrowthFailedPayload) => void;
};

type MinimalSocket = {
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
};

let socketInstance: MinimalSocket | undefined;

/** Lazily reuse the app's single Socket.IO connection. */
async function getSocket(): Promise<MinimalSocket> {
  if (socketInstance) return socketInstance;
  const { io } = await import('socket.io-client');
  const { env } = await import('../config/env');
  socketInstance = io(env.VITE_SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling']
  }) as unknown as MinimalSocket;
  return socketInstance;
}

/** Subscribe to growth:analysis:* events for one job. */
export async function onGrowthProgress(jobId: string, handlers: Handlers): Promise<() => void> {
  const s: MinimalSocket = await getSocket();
  const started = () => handlers.onStarted?.();
  const progress = (p: unknown) => {
    const payload = p as GrowthProgressPayload;
    if (payload.jobId === jobId) handlers.onProgress?.(payload);
  };
  const completed = (p: unknown) => {
    const payload = p as GrowthCompletedPayload;
    if (payload.jobId === jobId) handlers.onCompleted?.(payload);
  };
  const failed = (p: unknown) => {
    const payload = p as GrowthFailedPayload;
    if (payload.jobId === jobId) handlers.onFailed?.(payload);
  };
  s.on('growth:analysis:started', started);
  s.on('growth:analysis:progress', progress);
  s.on('growth:analysis:completed', completed);
  s.on('growth:analysis:failed', failed);
  return () => {
    s.off('growth:analysis:started', started);
    s.off('growth:analysis:progress', progress);
    s.off('growth:analysis:completed', completed);
    s.off('growth:analysis:failed', failed);
  };
}
