/** System status service calls. */
import { apiGet } from './api';

export interface ServiceStatus {
  status: 'up' | 'down' | 'not_configured';
}

export interface SystemStatus {
  services: {
    api: { status: 'up'; uptimeSeconds: number; version: string };
    database: ServiceStatus & { state: string; name: string | null };
    pythonService: ServiceStatus & { url: string };
  };
  timestamp: string;
}

export function fetchSystemStatus(): Promise<SystemStatus> {
  return apiGet<SystemStatus>('/status');
}
