/**
 * Authentication state — the single source of truth for the session.
 * Tokens live in HTTP-only cookies; this store only holds the PublicUser
 * (and a flag while the initial session probe is in flight).
 */
import { create } from 'zustand';

import type { PublicUser } from '../../../shared/types';
import * as authService from '../services/authService';
import type { LoginInput, RegisterInput, UpdateProfileInput } from '../services/authService';
import { toast } from './toastStore';

interface AuthState {
  user: PublicUser | null;
  /** True until the first /auth/me probe completes after a page load. */
  isLoading: boolean;
  login: (input: LoginInput) => Promise<PublicUser>;
  register: (input: RegisterInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  fetchCurrentUser: () => Promise<PublicUser | null>;
  updateProfile: (input: UpdateProfileInput) => Promise<PublicUser>;
  deleteAccount: () => Promise<void>;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (input) => {
    const user = await authService.login(input);
    set({ user, isLoading: false });
    return user;
  },

  register: async (input) => {
    const user = await authService.register(input);
    set({ user, isLoading: false });
    return user;
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      set({ user: null });
    }
  },

  logoutAll: async () => {
    try {
      const revoked = await authService.logoutAll();
      toast.info(`Signed out of ${revoked} session${revoked === 1 ? '' : 's'}`);
    } finally {
      set({ user: null });
    }
  },

  /** Probe the session on app boot; resolves null when signed out. */
  fetchCurrentUser: async () => {
    try {
      const user = await authService.fetchCurrentUser();
      set({ user, isLoading: false });
      return user;
    } catch {
      set({ user: null, isLoading: false });
      return null;
    }
  },

  updateProfile: async (input) => {
    const user = await authService.updateProfile(input);
    set({ user });
    return user;
  },

  deleteAccount: async () => {
    try {
      await authService.deleteAccount();
    } finally {
      set({ user: null });
    }
  },

  clearUser: () => set({ user: null, isLoading: false })
}));

/** Imperative read for non-hook code (router guards in tests, etc.). */
export function getAuthUser(): PublicUser | null {
  return useAuthStore.getState().user;
}
