import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { apiService, ApiError } from '@/services/api';

/**
 * useAuth — High-level authentication hook.
 *
 * Provides login / logout / checkSession actions that coordinate
 * between the API service layer and the auth Zustand store.
 */
export function useAuth() {
  const { setAuth, logout: clearStore, user, company, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  /**
   * Log in with email & password.
   * On success, fetches full profile and hydrates the store.
   */
  const login = useCallback(
    async (email: string, password: string) => {
      const loginRes = await apiService.login(email, password);

      setAuth(
        loginRes.user,
        loginRes.company ?? null,
        loginRes.companies ?? [],
        loginRes.entitlements ?? null,
      );

      return loginRes;
    },
    [setAuth],
  );

  /**
   * Sign up a new company.
   */
  const signup = useCallback(
    async (companyName: string, name: string, email: string, password: string) => {
      const res = await apiService.signup(companyName, name, email, password);

      setAuth(
        res.user,
        res.company ?? null,
        res.companies ?? [],
        res.entitlements ?? null,
      );

      return res;
    },
    [setAuth],
  );

  /**
   * Log out — calls the server, clears the store, navigates to /login.
   */
  const logout = useCallback(async () => {
    try {
      await apiService.logout();
    } catch {
      // Even if the server call fails, clear local state
    } finally {
      clearStore();
      navigate('/login', { replace: true });
    }
  }, [clearStore, navigate]);

  /**
   * Check if the current session is still valid.
   * Hydrates the store on success, clears on 401.
   */
  const checkSession = useCallback(async () => {
    try {
      const profile = await apiService.getProfile();
      setAuth(
        profile.user,
        profile.company ?? null,
        profile.companies ?? [],
        profile.entitlements ?? null,
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearStore();
      }
      return false;
    }
  }, [setAuth, clearStore]);

  return {
    user,
    company,
    isAuthenticated,
    login,
    signup,
    logout,
    checkSession,
  };
}
