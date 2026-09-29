/**
 * useGitHubSync — one hook for the whole GitHub lifecycle (§34, §28-§29):
 * status, connect URL, Sync Now with live socket progress (polling fallback),
 * and disconnect.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError } from '../services/api';
import {
  fetchGitHubStatus,
  fetchSyncJob,
  getAuthorizeUrl,
  startSync,
  disconnectGitHub,
  type GitHubStatus,
  type SyncJobInfo
} from '../services/githubService';
import { onSyncProgress } from '../services/syncSocket';

export interface UseGitHubSync {
  status: GitHubStatus | null;
  job: SyncJobInfo | null;
  syncing: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  sync: () => Promise<void>;
  disconnect: (deleteData: boolean) => Promise<void>;
}

export function useGitHubSync(): UseGitHubSync {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [job, setJob] = useState<SyncJobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchGitHubStatus();
      setStatus(s);
      setJob(s.latestJob ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load GitHub status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unsubRef.current?.();
    };
  }, [refresh]);

  /** Navigate to the GitHub authorize URL (full page — the flow is a redirect). */
  const connect = useCallback(async () => {
    setError(null);
    try {
      const { authorizeUrl } = await getAuthorizeUrl();
      window.location.assign(authorizeUrl);
    } catch (err) {
      // Without this, a failed /github/connect (e.g. expired session → 401)
      // is swallowed and the button silently does nothing.
      setError(err instanceof ApiRequestError ? err.message : 'Failed to start GitHub connection');
    }
  }, []);

  const sync = useCallback(async () => {
    setError(null);
    try {
      const { jobId } = await startSync();
      setJob({ id: jobId, status: 'QUEUED', progress: 0 });

      // Live updates via socket…
      unsubRef.current?.();
      unsubRef.current = onSyncProgress(jobId, {
        onProgress: (p) =>
          setJob((prev) =>
            prev && prev.id === jobId
              ? { ...prev, status: 'RUNNING', progress: p.progress, currentStep: p.step }
              : prev
          ),
        onCompleted: (p) => {
          setJob((prev) =>
            prev && prev.id === jobId
              ? { ...prev, status: 'COMPLETED', progress: 100, commitsProcessed: p.commits }
              : prev
          );
          void refresh();
        },
        onFailed: (p) => {
          setJob((prev) =>
            prev && prev.id === jobId ? { ...prev, status: 'FAILED', error: p.error } : prev
          );
        }
      });

      // …plus a polling fallback in case the socket drops (§28 resilience).
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void fetchSyncJob(jobId)
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
      setError(err instanceof ApiRequestError ? err.message : 'Failed to start sync');
    }
  }, [refresh]);

  const disconnect = useCallback(async (deleteData: boolean) => {
    await disconnectGitHub(deleteData);
    setJob(null);
    await refresh();
  }, [refresh]);

  const syncing =
    job?.status === 'QUEUED' || job?.status === 'RUNNING' || status?.account?.syncStatus === 'syncing';

  return { status, job, syncing: Boolean(syncing), loading, error, refresh, connect, sync, disconnect };
}
