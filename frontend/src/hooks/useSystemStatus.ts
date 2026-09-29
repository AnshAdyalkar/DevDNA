/** React Query hook for system status. */
import { useQuery } from '@tanstack/react-query';

import { fetchSystemStatus, type SystemStatus } from '../services/statusService';

export function useSystemStatus(refreshMs = 30_000) {
  return useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatus,
    refetchInterval: refreshMs,
    staleTime: 15_000,
    retry: 1
  });
}
