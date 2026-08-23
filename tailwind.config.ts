import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Core token system ── */
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',

        'surface-low': 'rgb(var(--surface-low) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-high': 'rgb(var(--surface-high) / <alpha-value>)',
        'surface-highest': 'rgb(var(--surface-highest) / <alpha-value>)',

        'foreground-secondary': 'rgb(var(--foreground-secondary) / <alpha-value>)',
        'foreground-tertiary': 'rgb(var(--foreground-tertiary) / <alpha-value>)',

        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          container: 'rgb(var(--primary-container) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },

        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },

        border: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },

        ring: 'rgb(var(--ring) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',

        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',

        card: 'rgb(var(--card) / <alpha-value>)',
        'card-foreground': 'rgb(var(--card-foreground) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground) / <alpha-value>)',

        /* ── Compatibility aliases (old MD3 names → new tokens) ── */
        'on-background': 'rgb(var(--foreground) / <alpha-value>)',
        'on-surface': 'rgb(var(--foreground) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--foreground-secondary) / <alpha-value>)',
        'on-primary': 'rgb(var(--primary-foreground) / <alpha-value>)',
        'on-secondary': 'rgb(var(--primary-foreground) / <alpha-value>)',
        secondary: 'rgb(var(--primary-container) / <alpha-value>)',
        destructive: 'rgb(var(--error) / <alpha-value>)',
        'surface-container': 'rgb(var(--surface-high) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--surface-low) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--surface-low) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--surface-high) / <alpha-value>)',
        outline: 'rgb(var(--border-default) / <alpha-value>)',
        'outline-variant': 'rgb(var(--border-subtle) / <alpha-value>)',
      },
      fontFamily: {
        headline: ['Plus Jakarta Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        arabic: ['Plus Jakarta Sans', 'Noto Sans Arabic', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        20: 'var(--space-20)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        ambient: '0 40px 60px -10px rgb(0 0 0 / 0.4)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
