/**
 * useDna — Developer DNA state: profile, latest job, analyze action with
 * live Socket.IO progress and a polling fallback (§23, §25).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '../services/api';
import { toast } from '../store/toastStore';
import {
  fetchAnalysisJob,
  fetchDnaProfile,
  fetchLatestJob,
  onAnalysisProgress,
  startAnalysis,
  type AnalysisJobInfo,
  type DnaProfile
} from '../services/dnaService';

export interface UseDna {
  profile: DnaProfile | null;
  job: AnalysisJobInfo | null;
  analyzing: boolean;
  loading: boolean;
  error: string | null;
  analyze: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDna(): UseDna {
  const [profile, setProfile] = useState<DnaProfile | null>(null);
  const [job, setJob] = useState<AnalysisJobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    const [latest, dna] = await Promise.allSettled([fetchLatestJob(), fetchDnaProfile()]);
    if (latest.status === 'fulfilled') setJob(latest.value.job);
    if (dna.status === 'fulfilled') {
      setProfile(dna.value);
      setError(null);
    } else if (latest.status === 'rejected') {
      // Both calls failed — the backend is unreachable (a lone 404 just
      // means "no analysis yet", which is the empty state, not an error).
      const err = latest.reason;
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load Developer DNA');
      setProfile(null);
    } else {
      setProfile(null);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unsubRef.current?.();
    };
  }, [refresh]);

  const analyze = useCallback(async () => {
    setError(null);
    try {
      const { jobId } = await startAnalysis();
      setJob({ id: jobId, status: 'RUNNING', progress: 2 });

      unsubRef.current?.();
      unsubRef.current = await onAnalysisProgress(jobId, {
        onProgress: (p) =>
          setJob((prev) =>
            prev && prev.id === jobId
              ? { ...prev, status: 'RUNNING', progress: p.progress, currentStep: p.currentStep }
              : prev
          ),
        onCompleted: () => {
          setJob((prev) => (prev && prev.id === jobId ? { ...prev, status: 'COMPLETED', progress: 100 } : prev));
          void refresh();
        },
        onFailed: (p) => {
          setJob((prev) =>
            prev && prev.id === jobId ? { ...prev, status: 'FAILED', error: p.error } : prev
          );
        }
      });

      // Polling fallback (§23: real progress even if the socket drops).
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void fetchAnalysisJob(jobId)
          .then((j) => {
            setJob(j);
            if (j.status === 'COMPLETED' || j.status === 'FAILED') {
              if (pollRef.current) clearInterval(pollRef.current);
              void refresh();
            }
          })
          .catch(() => undefined);
      }, 2_500);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        toast.error(err.message);
      } else {
        setError('Failed to start analysis');
      }
    }
  }, [refresh]);

  const analyzing =
    job?.status === 'QUEUED' ||
    job?.status === 'RUNNING' ||
    job?.status === 'FETCHING_DATA' ||
    job?.status === 'ANALYZING_REPOSITORIES' ||
    job?.status === 'CALCULATING_SKILLS' ||
    job?.status === 'GENERATING_DNA';

  return { profile, job, analyzing: Boolean(analyzing), loading, error, analyze, refresh };
}
