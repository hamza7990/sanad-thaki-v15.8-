import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, Company, Entitlements } from '@/types';

// ============================================================
// Auth Store — Session & identity management
// ============================================================

interface AuthState {
  /** Currently authenticated user */
  user: User | null;
  /** Active company context */
  company: Company | null;
  /** All companies the user has access to */
  companies: Company[];
  /** Feature entitlements for the active company/plan */
  entitlements: Entitlements | null;

  // Computed
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;

  // Actions
  /** Set full auth context after login or session check */
  setAuth: (
    user: User,
    company: Company | null,
    companies: Company[],
    entitlements: Entitlements | null,
  ) => void;
  /** Switch the active company context */
  setCompany: (company: Company) => void;
  /** Clear all auth state (logout) */
  logout: () => void;
}

const initialState = {
  user: null,
  company: null,
  companies: [],
  entitlements: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: (user, company, companies, entitlements) =>
        set({
          user,
          company,
          companies,
          entitlements,
          isAuthenticated: !!user,
        }),

      setCompany: (company) =>
        set({ company }),

      logout: () =>
        set({ ...initialState }),
    }),
    {
      name: 'sanad-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist identity data, not actions
      partialize: (state) => ({
        user: state.user,
        company: state.company,
        companies: state.companies,
        entitlements: state.entitlements,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
