import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Theme, Locale } from '@/types';

// ============================================================
// Theme Store — Visual preferences & layout state
// ============================================================

interface ThemeState {
  /** Current theme preference */
  theme: Theme;
  /** Current locale */
  locale: Locale;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;

  // Computed
  /** Resolve 'system' to actual 'light' | 'dark' */
  resolvedTheme: () => 'light' | 'dark';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      locale: 'ar',
      sidebarCollapsed: false,

      setTheme: (theme) => set({ theme }),

      setLocale: (locale) => set({ locale }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      resolvedTheme: () => {
        const { theme } = get();
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        }
        return theme;
      },
    }),
    {
      name: 'sanad-theme',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
