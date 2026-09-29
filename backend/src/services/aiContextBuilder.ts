/**
 * Build a compact, grounded AI context from already-calculated DevDNA data (§5, §6).
 *
 * Rules:
 *  - Never dump the whole database: only a bounded, purpose-built projection.
 *  - Deterministic Phases 4–5 output is the source of truth; this module only
 *    reshapes it for the LLM.
 *  - Untrusted strings (repository descriptions, user profile bio) are fenced
 *    via <untrusted_...> blocks so the model treats them as data, not
 *    instructions (§10). The model also never sees full file contents —
 *    only counts/summaries already computed by the analyzers.
 */
import mongoose from 'mongoose';

import { Repository } from '../models/Repository.js';
import { User } from '../models/User.js';
import { pythonPost } from '../utils/pythonClient.js';
import { fenceUntrusted } from './ai/index.js';

const MAX_REPOSITORIES = 20;
/** Keep prompts bounded even for large profiles. */
const MAX_SKILLS = 15;
const MAX_GAPS = 10;
const MAX_ROADMAP_PHASES = 6;
const MAX_PROJECTS = 3;

export interface DeveloperAIContext {
  developer: {
    username: string;
    targetRole?: string;
    githubConnected: boolean;
  };
  dna: {
    analyzedAt?: string;
    overall?: number;
    languages: { name: string; percentage: number }[];
    skills: { skill: string; score: number; confidence: number; evidence: string[] }[];
    strengths: string[];
    areasToImprove: string[];
    behaviorObservations: string[];
    summaryMetrics: Record<string, unknown>;
  };
  repositories: {
    name: string;
    primaryLanguage?: string;
    topics: string[];
    stars: number;
    hasTests?: boolean;
    untrustedDescription?: string;
  }[];
  technologies: string[];
  skillGaps: { skill: string; gap: number; priority: string; kind: string; requiredLevel: number }[];
  roadmap: { version: number; targetRole: string; phases: { title: string; skills: string[]; estimatedDuration: string }[] } | null;
  recommendedProjects: { title: string; difficulty: string; technologies: string[]; gapsAddressed: string[] }[];
}

/** Shape of the Python profile document we rely on (Phase 4). */
interface PythonProfile {
  analysisVersion?: string;
  analyzedAt?: string;
  updatedAt?: string;
  primaryLanguages?: { name: string; percentage: number }[];
  technologies?: string[];
  skills?: { skill: string; score: number; confidence: number; evidence: { type: string; value: string }[] }[];
  behavior?: { observations?: string[] };
  summaryMetrics?: Record<string, unknown>;
}

interface GrowthGaps {
  targetRole: string;
  gaps: { skill: string; gap: number; priority: string; kind: string; requiredLevel: number }[];
  strengths: string[];
}

interface GrowthRoadmap {
  version: number;
  targetRole: string;
  phases: { title: string; skills: string[]; estimatedDuration: string }[];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function buildDeveloperAIContext(userId: string): Promise<DeveloperAIContext> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [user, repositories] = await Promise.all([
    User.findById(userObjectId).lean(),
    Repository.find({ userId: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(MAX_REPOSITORIES)
      .lean()
  ]);

  // Phase 4 profile (deterministic analysis; source of truth).
  let profile: PythonProfile = {};
  let dnaAvailable = false;
  try {
    // The Python endpoint returns the profile document directly (no wrapper).
    const response = await pythonPost<Record<string, never>, PythonProfile>(
      `/api/intelligence/profile/user/${userId}`,
      {} as Record<string, never>
    );
    profile = response ?? {};
    dnaAvailable = Boolean(profile.skills?.length);
  } catch {
    // No DNA analysis yet — the context honestly reports that (§7.4).
    profile = {};
  }

  // Phase 5 growth data (optional — chat still works without it).
  let gaps: GrowthGaps | null = null;
  let roadmap: GrowthRoadmap | null = null;
  let projects: { title: string; difficulty: string; technologies: string[]; gapsAddressed: string[] }[] = [];
  if (dnaAvailable) {
    const results = await Promise.allSettled([
      pythonPost<{ userId: string; targetRole: string }, GrowthGaps>('/api/growth/gaps', {
        userId,
        targetRole: user?.targetRole ?? ''
      }),
      pythonPost<{ userId: string; targetRole: string }, GrowthRoadmap>('/api/growth/roadmap', {
        userId,
        targetRole: user?.targetRole ?? ''
      }),
      pythonPost<{ userId: string; targetRole: string }, { projects: { title: string; difficulty: string; technologies: string[]; gapsAddressed: string[] }[] }>(
        '/api/growth/projects',
        { userId, targetRole: user?.targetRole ?? '' }
      )
    ]);
    if (results[0].status === 'fulfilled') gaps = results[0].value;
    if (results[1].status === 'fulfilled') roadmap = results[1].value;
    if (results[2].status === 'fulfilled') projects = results[2].value.projects ?? [];
  }

  const skills = (profile.skills ?? [])
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SKILLS)
    .map((s) => ({
      skill: s.skill,
      score: s.score,
      confidence: s.confidence,
      evidence: (s.evidence ?? []).slice(0, 3).map((e) => `${e.type}: ${truncate(String(e.value), 120)}`)
    }));

  return {
    developer: {
      username: user?.githubUsername ?? user?.username ?? 'developer',
      ...(user?.targetRole ? { targetRole: user.targetRole } : {}),
      githubConnected: Boolean(user?.githubConnected)
    },
    dna: {
      ...(profile.analyzedAt ? { analyzedAt: profile.analyzedAt } : {}),
      ...(typeof (profile.summaryMetrics as { overallScore?: number } | undefined)?.overallScore === 'number'
        ? { overall: (profile.summaryMetrics as { overallScore: number }).overallScore }
        : {}),
      languages: (profile.primaryLanguages ?? []).slice(0, 6).map((l) => ({ name: l.name, percentage: l.percentage })),
      skills,
      strengths: (gaps?.strengths ?? []).slice(0, 6),
      // Phase 4 does not emit named weaknesses; derive honestly from the
      // lowest-scoring skills + behavior so the AI never invents them.
      areasToImprove: skills
        .slice(-4)
        .filter((s) => s.score < 70)
        .map((s) => `${s.skill} (score ${s.score})`),
      behaviorObservations: (profile.behavior?.observations ?? []).slice(0, 8),
      summaryMetrics: profile.summaryMetrics ?? {}
    },
    repositories: repositories.map((r) => {
      const hasTests = Boolean((r.languages as { hasTests?: boolean } | undefined)?.hasTests);
      return {
        name: r.name,
        ...(r.primaryLanguage ? { primaryLanguage: r.primaryLanguage } : {}),
        topics: (r.topics ?? []).slice(0, 6),
        stars: r.stars ?? 0,
        ...(hasTests ? { hasTests: true } : {}),
        // Descriptions are user-authored → untrusted data, fenced (§10).
        ...(r.description ? { untrustedDescription: fenceUntrusted('repo_description', truncate(r.description, 200)) } : {})
      };
    }),
    technologies: (profile.technologies ?? []).slice(0, 25),
    skillGaps: (gaps?.gaps ?? [])
      .slice(0, MAX_GAPS)
      .map((g) => ({ skill: g.skill, gap: g.gap, priority: g.priority, kind: g.kind, requiredLevel: g.requiredLevel })),
    roadmap: roadmap
      ? {
          version: roadmap.version,
          targetRole: roadmap.targetRole,
          phases: (roadmap.phases ?? []).slice(0, MAX_ROADMAP_PHASES).map((p) => ({
            title: p.title,
            skills: (p.skills ?? []).slice(0, 5),
            estimatedDuration: p.estimatedDuration
          }))
        }
      : null,
    recommendedProjects: projects.slice(0, MAX_PROJECTS).map((p) => ({
      title: p.title,
      difficulty: p.difficulty,
      technologies: (p.technologies ?? []).slice(0, 6),
      gapsAddressed: (p.gapsAddressed ?? []).slice(0, 5)
    }))
  };
}

/**
 * Deterministic version stamp over everything that feeds the AI context (§49).
 * A change in any source document bumps the version and invalidates cached
 * insights naturally — no blind forever-caching.
 */
export async function buildSourceDataVersion(userId: string, scope = 'profile'): Promise<string> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [profileMeta, roadmapMeta, latestRepo] = await Promise.all([
    pythonPost<Record<string, never>, { analysisVersion?: string; analyzedAt?: string }>(
      `/api/intelligence/profile/user/${userId}`,
      {} as Record<string, never>
    ).catch(() => null),
    pythonPost<{ userId: string; targetRole: string }, { version?: number; generatedAt?: string }>(
      '/api/growth/roadmap',
      { userId, targetRole: '' }
    ).catch(() => null),
    Repository.findOne({ userId: userObjectId }).sort({ updatedAt: -1 }).select('updatedAt').lean()
  ]);

  const parts = [
    `scope:${scope}`,
    profileMeta?.analysisVersion ?? 'no-dna',
    profileMeta?.analyzedAt ?? 'never',
    roadmapMeta ? `roadmap:${roadmapMeta.version}@${roadmapMeta.generatedAt}` : 'no-roadmap',
    latestRepo?.updatedAt ? `repos:${latestRepo.updatedAt}` : 'no-repos'
  ];
  return parts.join('|');
}
