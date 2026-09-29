/**
 * DevDNA — shared cross-service types.
 *
 * These describe the contract between the React frontend, the Node.js
 * API gateway, and the Python intelligence service. Keep them in sync
 * with `intelligence/app/models/` (Pydantic) and MongoDB documents.
 */

/** Standard API envelope used by every Node.js response. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    /** Field-level details for validation failures. */
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** A scored skill with the measurable evidence that produced it. */
export interface SkillScore {
  skill: string;
  /** Normalized 0–100. */
  score: number;
  /** 0–1 — how strongly the signals support this score. */
  confidence: number;
  evidence: string[];
}

/** Health report returned by the backend `/health` endpoint. */
export interface BackendHealth {
  status: 'ok';
  service: 'backend';
  database: 'connected' | 'disconnected' | 'connecting';
  pythonService: 'up' | 'down' | 'not_configured';
  uptimeSeconds: number;
  timestamp: string;
}

/** Health report returned by the intelligence service `/health`. */
export interface PythonHealth {
  status: 'ok';
  service: 'intelligence';
  version: string;
  analyzers: string[];
}

// ─── Authentication & users (Phase 2) ────────────────────────────────────────

export const TARGET_ROLES = [
  'Full Stack Developer',
  'Python Developer',
  'Backend Developer',
  'Frontend Developer',
  'Software Engineer',
  'Data Analyst',
  'AI/ML Engineer',
  'DevOps Engineer'
] as const;

export const EXPERIENCE_LEVELS = ['student', 'junior', 'mid', 'senior'] as const;

export type TargetRole = (typeof TARGET_ROLES)[number];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** Safe user shape returned by every auth/user endpoint — never secrets. */
export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar?: string | undefined;
  bio?: string | undefined;
  location?: string | undefined;
  college?: string | undefined;
  degree?: string | undefined;
  graduationYear?: number | undefined;
  targetRole?: TargetRole | undefined;
  experienceLevel?: ExperienceLevel | undefined;
  githubConnected: boolean;
  createdAt: string;
}

/** A login session shown in the settings UI. */
export interface SessionInfo {
  id: string;
  userAgent: string;
  lastUsedAt: string;
  createdAt: string;
  current?: boolean;
}
