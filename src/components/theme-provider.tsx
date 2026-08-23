import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';

type Theme = 'light' | 'dark' | 'soft';
type DbTheme = 'light' | 'dark' | 'soft' | 'system';

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: 'light',
  setTheme: () => null,
});

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  storageKey = 'xo-theme',
}: ThemeProviderProps) {
  const userIdRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const stored = window.localStorage.getItem(storageKey) as Theme | null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    if (stored === 'light' || stored === 'dark' || stored === 'soft') {
      return stored;
    }

    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    let mounted = true;

    const resolveSystemTheme = (): Theme => {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    };

    const applyDbThemeForCurrentUser = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      userIdRef.current = userId;

      if (!userId || !mounted) return;

      // A theme chosen on this device is authoritative and must never be
      // overwritten by background auth events (autoRefreshToken's
      // TOKEN_REFRESHED, or the SIGNED_IN re-emit when the tab regains focus).
      // The DB is only used to seed the theme on a device with no local choice.
      const localPref = window.localStorage.getItem(storageKey);
      if (localPref === 'light' || localPref === 'dark' || localPref === 'soft') {
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('theme_preference')
        .eq('id', userId)
        .maybeSingle<{ theme_preference: DbTheme | null }>();

      if (!mounted || !profile?.theme_preference) return;

      const resolvedTheme: Theme =
        profile.theme_preference === 'system'
          ? resolveSystemTheme()
          : profile.theme_preference;

      window.localStorage.setItem(storageKey, resolvedTheme);
      setTheme(resolvedTheme);
    };

    void applyDbThemeForCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user?.id ?? null;
      if (!session?.user?.id || !mounted) return;
      void applyDbThemeForCurrentUser();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [storageKey]);

  useEffect(() => {
    const root = document.documentElement;

    root.removeAttribute('data-theme');
    root.classList.remove('dark', 'light');

    root.setAttribute('data-theme', theme);

    const isDark = theme === 'dark';
    root.classList.add(isDark ? 'dark' : 'light');
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: Theme) => {
      window.localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
      const userId = userIdRef.current;
      if (!userId) return;

      void supabase
        .from('users')
        .update({ theme_preference: newTheme } as never)
        .eq('id', userId);
    },
  };

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
