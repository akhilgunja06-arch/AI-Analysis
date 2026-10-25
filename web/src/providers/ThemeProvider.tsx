import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  /** True when the operating system asks for reduced motion. */
  systemReducedMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'skillspring.theme';
const MOTION_KEY = 'skillspring.reducedMotion';

/**
 * Theme and motion preferences.
 *
 * Only display preferences are persisted in localStorage. No credential, token
 * or personal datum is ever written to client storage.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });

  const [reducedMotion, setReducedMotionState] = useState<boolean>(
    () => localStorage.getItem(MOTION_KEY) === 'true',
  );

  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    setSystemReducedMotion(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedTheme === 'dark' ? '#0b1020' : '#f7f8fd');
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
  }, []);

  const setReducedMotion = useCallback((value: boolean) => {
    setReducedMotionState(value);
    localStorage.setItem(MOTION_KEY, String(value));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      reducedMotion,
      setReducedMotion,
      systemReducedMotion,
    }),
    [theme, resolvedTheme, setTheme, reducedMotion, setReducedMotion, systemReducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider.');
  return context;
}

/** True when animations should be suppressed (OS preference or in-app toggle). */
export function usePrefersReducedMotion(): boolean {
  const { reducedMotion, systemReducedMotion } = useTheme();
  return reducedMotion || systemReducedMotion;
}
