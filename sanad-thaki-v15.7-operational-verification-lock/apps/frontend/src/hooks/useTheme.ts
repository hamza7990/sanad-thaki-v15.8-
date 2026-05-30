import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';

/**
 * useThemeEffect — Side-effect hook that synchronizes theme store state
 * with the DOM (data-theme, dir, lang attributes).
 *
 * Must be called once near the root of the app (e.g. in App.tsx or a
 * top-level layout). It:
 *  1. Applies `data-theme="light|dark"` to `<html>`
 *  2. Listens for OS-level theme changes when theme='system'
 *  3. Sets `dir` and `lang` on `<html>` based on locale
 */
export function useThemeEffect(): void {
  const theme = useThemeStore((s) => s.theme);
  const locale = useThemeStore((s) => s.locale);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  // ── Theme attribute ──────────────────────────────────────────
  useEffect(() => {
    const applyTheme = () => {
      const resolved = resolvedTheme();
      document.documentElement.setAttribute('data-theme', resolved);
    };

    applyTheme();

    // Listen for system preference changes when theme is 'system'
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();

      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
  }, [theme, resolvedTheme]);

  // ── Locale / direction attributes ────────────────────────────
  useEffect(() => {
    const html = document.documentElement;

    if (locale === 'ar') {
      html.setAttribute('dir', 'rtl');
      html.setAttribute('lang', 'ar');
    } else {
      html.setAttribute('dir', 'ltr');
      html.setAttribute('lang', 'en');
    }
  }, [locale]);
}
