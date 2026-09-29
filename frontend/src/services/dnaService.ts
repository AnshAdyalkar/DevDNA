/** Developer DNA service — wraps /api/intelligence endpoints (Phase 4 §25). */
import { apiGet, apiPost } from './api';

export interface EvidenceItem {
  type: string;
  value: string;
}

export interface DnaSkill {
  skill: string;
  score: number;
  confidence: number;
  evidence: EvidenceItem[];
  updatedAt: string;
}

export interface DnaProfile {
  analysisVersion: string;
  analyzedAt: string;
  updatedAt: string;
  repositoriesAnalyzed: number;
  primaryLanguages: { name: string; bytes: number; percentage: number }[];
  technologies: string[];
  projectTypes: { projectType: string; confidence: number; evidence: string[] }[];
  skills: DnaSkill[];
  behavior: { observations: string[]; metrics: Record<string, unknown> };
  engineeringPractices: Record<string, unknown>;
  summaryMetrics: Record<string, unknown>;
}

export interface RepoAnalysisSummary {
  repositoryId: string;
  fullName: string;
  primaryLanguage?: string;
  analysisVersion: string;
  analyzedAt: string;
  languages: { name: string; bytes: number; percentage: number }[];
  technologies: string[];
  metrics: {
    files: number;
    sourceFiles: number;
    testFiles: number;
    documentationFiles: number;
    configurationFiles: number;
    linesOfCode: number;
    largeFiles: number;
    manifestTruncated?: boolean;
  };
  complexity: {
    complexityScore: number;
    level: string;
    factors: { factor: string; contribution: number }[];
  };
  documentation: {
    documentationScore: number | null;
    readmePresent: boolean;
    readmeLength: number;
    sectionsDetected: string[];
  };
  testing: {
    testingScore: number | null;
    testFiles: number;
    sourceFiles: number;
    sourceToTestRatio?: number | null;
    frameworks: string[];
    notes: string[];
  };
  projectType: { projectType: string; confidence: number; evidence: string[] } | null;
  architectureSignals?: string[];
}

export interface AnalysisJobInfo {
  id: string;
  status: string;
  progress: number;
  currentStep?: string;
  skillsDetected?: number;
  error?: string;
  completedAt?: string;
}

export function startAnalysis(): Promise<{ jobId: string; status: string; reused: boolean }> {
  return apiPost<{ jobId: string; status: string; reused: boolean }>('/intelligence/analyze').then(
    (r) => r.data
  );
}

export function fetchAnalysisJob(jobId: string): Promise<AnalysisJobInfo> {
  return apiGet<AnalysisJobInfo>(`/intelligence/status/${jobId}`);
}

export function fetchLatestJob(): Promise<{ job: AnalysisJobInfo | null }> {
  return apiGet<{ job: AnalysisJobInfo | null }>('/intelligence/jobs');
}

export function fetchDnaProfile(): Promise<DnaProfile> {
  return apiGet<DnaProfile>('/intelligence/dna');
}

export function fetchRepoAnalyses(): Promise<{ repositories: RepoAnalysisSummary[] }> {
  return apiGet<{ repositories: RepoAnalysisSummary[] }>('/intelligence/repositories');
}

export function fetchRepoAnalysis(id: string): Promise<RepoAnalysisSummary> {
  return apiGet<RepoAnalysisSummary>(`/intelligence/repositories/${id}`);
}

/** Analysis socket events (§23) — mirrors syncSocket for the analysis namespace. */
export interface AnalysisProgressPayload {
  jobId: string;
  progress: number;
  currentStep?: string;
  repositoriesTotal?: number;
}

export interface AnalysisCompletedPayload {
  jobId: string;
  progress: number;
  skillsDetected: number;
  repositoriesAnalyzed: number;
}

export interface AnalysisFailedPayload {
  jobId: string;
  error: string;
}

type Handlers = {
  onStarted?: () => void;
  onProgress?: (p: AnalysisProgressPayload) => void;
  onCompleted?: (p: AnalysisCompletedPayload) => void;
  onFailed?: (p: AnalysisFailedPayload) => void;
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

/** Subscribe to intelligence:analysis:* events for one job. */
export async function onAnalysisProgress(jobId: string, handlers: Handlers): Promise<() => void> {
  const s: MinimalSocket = await getSocket();
  const started = () => handlers.onStarted?.();
  const progress = (p: unknown) => {
    const payload = p as AnalysisProgressPayload;
    if (payload.jobId === jobId) handlers.onProgress?.(payload);
  };
  const completed = (p: unknown) => {
    const payload = p as AnalysisCompletedPayload;
    if (payload.jobId === jobId) handlers.onCompleted?.(payload);
  };
  const failed = (p: unknown) => {
    const payload = p as AnalysisFailedPayload;
    if (payload.jobId === jobId) handlers.onFailed?.(payload);
  };
  s.on('intelligence:analysis:started', started);
  s.on('intelligence:analysis:progress', progress);
  s.on('intelligence:analysis:completed', completed);
  s.on('intelligence:analysis:failed', failed);
  return () => {
    s.off('intelligence:analysis:started', started);
    s.off('intelligence:analysis:progress', progress);
    s.off('intelligence:analysis:completed', completed);
    s.off('intelligence:analysis:failed', failed);
  };
}
