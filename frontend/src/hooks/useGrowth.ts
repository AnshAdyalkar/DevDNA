/**
 * useGrowth — Skill Gap & Growth state: target-role selection, gaps,
 * roadmap, projects, the analysis job with live Socket.IO progress and a
 * polling fallback (§20), regeneration (§28) and phase progress (§30).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '../services/api';
import { toast } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import {
  fetchGaps,
  fetchGrowthJob,
  fetchOutdated,
  fetchProjects,
  fetchRoadmap,
  fetchRoles,
  onGrowthProgress,
  regenerateRoadmap,
  startGrowthAnalysis,
  updatePhaseProgress,
  type GapsPayload,
  type GrowthJobInfo,
  type ProjectRecommendation,
  type RoleMatrixDTO,
  type Roadmap
} from '../services/growthService';

export type PhaseStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED';

export interface UseGrowth {
  roles: RoleMatrixDTO[];
  selectedRole: string;
  setSelectedRole: (role: string) => void;
  gaps: GapsPayload | null;
  roadmap: Roadmap | null;
  projects: ProjectRecommendation[];
  outdated: boolean;
  job: GrowthJobInfo | null;
  analyzing: boolean;
  loading: boolean;
  error: string | null;
  analyze: () => Promise<void>;
  regenerate: () => Promise<void>;
  markPhase: (phaseId: string, status: PhaseStatus) => Promise<void>;
  refresh: () => Promise<void>;
}

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'CALCULATING_GAPS', 'BUILDING_DEPENDENCIES', 'GENERATING_ROADMAP', 'GENERATING_PROJECTS'];

export function useGrowth(): UseGrowth {
  const user = useAuthStore((s) => s.user);
  const [roles, setRoles] = useState<RoleMatrixDTO[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(user?.targetRole ?? '');
  const [gaps, setGaps] = useState<GapsPayload | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [projects, setProjects] = useState<ProjectRecommendation[]>([]);
  const [outdated, setOutdated] = useState(false);
  const [job, setJob] = useState<GrowthJobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Keep the latest role in a ref so callbacks created once (refresh,
  // polling, sockets) always read the current selection.
  const roleRef = useRef(selectedRole);
  roleRef.current = selectedRole;

  const refresh = useCallback(async () => {
    try {
      const rolesResult = await fetchRoles();
      setRoles(rolesResult.roles);
    } catch {
      // Roles are configuration; a failure here means the API is down.
    }

    const role = roleRef.current;
    // Gaps need a role; roadmap/projects fall back to the user's latest
    // roadmap (any role) when unspecified — matching the backend contract.
    const gapsPromise: Promise<GapsPayload | null> = role ? fetchGaps(role) : Promise.resolve(null);
    const [gapsRes, roadmapRes, projectsRes, outdatedRes] = await Promise.allSettled([
      gapsPromise,
      fetchRoadmap(role || undefined),
      fetchProjects(role || undefined),
      fetchOutdated()
    ] as const);

    if (gapsRes.status === 'fulfilled') {
      setGaps(gapsRes.value);
      if (gapsRes.value) setError(null);
    } else {
      setGaps(null);
      const err = gapsRes.reason;
      // A lone 404 = "no analysis yet" (the empty state), not an error.
      if (err instanceof ApiRequestError && err.status !== 404) {
        setError(err.message);
      } else if (!(err instanceof ApiRequestError)) {
        setError('Failed to load growth analysis');
      }
    }
    setRoadmap(roadmapRes.status === 'fulfilled' ? roadmapRes.value : null);
    setProjects(projectsRes.status === 'fulfilled' ? projectsRes.value.projects : []);
    if (outdatedRes.status === 'fulfilled') setOutdated(outdatedRes.value.outdated);
    setLoading(false);
  }, []);

  // Load on mount and whenever the selected role changes.
  useEffect(() => {
    void refresh();
  }, [refresh, selectedRole]);

  // Cleanup on unmount only.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unsubRef.current?.();
    };
  }, []);

  const watchJob = useCallback(
    (jobId: string) => {
      unsubRef.current?.();
      unsubRef.current = null;
      void onGrowthProgress(jobId, {
        onProgress: (p) =>
          setJob((prev) =>
            prev && prev.id === jobId ? { ...prev, status: 'RUNNING', progress: p.progress, currentStep: p.currentStep } : prev
          ),
        onCompleted: () => {
          setJob((prev) => (prev && prev.id === jobId ? { ...prev, status: 'COMPLETED', progress: 100 } : prev));
          void refresh();
        },
        onFailed: (p) => {
          setJob((prev) => (prev && prev.id === jobId ? { ...prev, status: 'FAILED', error: p.error } : prev));
          toast.error(p.error);
        }
      }).then((unsub) => {
        unsubRef.current = unsub;
      });

      // Polling fallback (real progress even when the socket drops, §20).
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void fetchGrowthJob(jobId)
          .then((j) => {
            setJob(j);
            if (j.status === 'COMPLETED' || j.status === 'FAILED') {
              if (pollRef.current) clearInterval(pollRef.current);
              void refresh();
            }
          })
          .catch(() => undefined);
      }, 2_500);
    },
    [refresh]
  );

  const analyze = useCallback(async () => {
    const role = roleRef.current;
    if (!role) {
      toast.error('Select a target role first');
      return;
    }
    setError(null);
    try {
      const { jobId } = await startGrowthAnalysis(role);
      setJob({ id: jobId, status: 'RUNNING', progress: 4, targetRole: role });
      watchJob(jobId);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        toast.error(err.message);
      } else {
        setError('Failed to start growth analysis');
      }
    }
  }, [watchJob]);

  const regenerate = useCallback(async () => {
    const role = roleRef.current;
    if (!role) return;
    try {
      const { roadmapVersion } = await regenerateRoadmap(role);
      toast.success(`Roadmap updated to v${roadmapVersion}`);
      setOutdated(false);
      await refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) toast.error(err.message);
      else toast.error('Failed to regenerate the roadmap');
    }
  }, [refresh]);

  const markPhase = useCallback(
    async (phaseId: string, status: PhaseStatus) => {
      try {
        const updated = await updatePhaseProgress([{ phaseId, status }]);
        setRoadmap(updated);
      } catch (err) {
        if (err instanceof ApiRequestError) toast.error(err.message);
        else toast.error('Failed to update progress');
      }
    },
    []
  );

  const analyzing = Boolean(job && ACTIVE_STATUSES.includes(job.status));

  return {
    roles,
    selectedRole,
    setSelectedRole,
    gaps,
    roadmap,
    projects,
    outdated,
    job,
    analyzing,
    loading,
    error,
    analyze,
    regenerate,
    markPhase,
    refresh
  };
}
