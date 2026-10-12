import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark' | 'soft';

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: 'light',
  setTheme: () => null,
});

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
