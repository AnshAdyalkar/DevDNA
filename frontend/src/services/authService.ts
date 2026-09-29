/** Authentication service — wraps the /api/auth and /api/users endpoints. */
import { apiDelete, apiGet, apiPatch, apiPost } from './api';
import type {
  ExperienceLevel,
  PublicUser,
  SessionInfo,
  TargetRole
} from '../../../shared/types';

export interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  username?: string;
  bio?: string;
  location?: string;
  college?: string;
  degree?: string;
  graduationYear?: number;
  targetRole?: TargetRole;
  experienceLevel?: ExperienceLevel;
  avatar?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function register(input: RegisterInput): Promise<PublicUser> {
  return apiPost<{ user: PublicUser }>('/auth/register', input).then((r) => r.data.user);
}

export function login(input: LoginInput): Promise<PublicUser> {
  return apiPost<{ user: PublicUser }>('/auth/login', input).then((r) => r.data.user);
}

export function logout(): Promise<void> {
  return apiPost<{ loggedOut: boolean }>('/auth/logout').then(() => undefined);
}

export function logoutAll(): Promise<number> {
  return apiPost<{ revoked: number }>('/auth/logout-all').then((r) => r.data.revoked);
}

export function fetchCurrentUser(): Promise<PublicUser> {
  return apiGet<{ user: PublicUser }>('/auth/me').then((r) => r.user);
}

export function fetchSessions(): Promise<SessionInfo[]> {
  return apiGet<{ sessions: SessionInfo[] }>('/auth/sessions').then((r) => r.sessions);
}

export function updateProfile(input: UpdateProfileInput): Promise<PublicUser> {
  return apiPatch<{ user: PublicUser }>('/users/me', input).then((r) => r.data.user);
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiPatch<{ changed: boolean }>('/auth/password', input).then(() => undefined);
}

export function deleteAccount(confirm = true): Promise<void> {
  return apiDelete<{ deleted: boolean }>('/users/me', { confirm }).then(() => undefined);
}

export function forgotPassword(email: string): Promise<void> {
  return apiPost<{ requested: boolean }>('/auth/forgot-password', { email }).then(
    () => undefined
  );
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiPost<{ reset: boolean }>('/auth/reset-password', {
    token,
    newPassword
  }).then(() => undefined);
}
