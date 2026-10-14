// Unit tests. Kept apart from vite.config.ts so tests never load the dev-server middleware
// that contacts Supabase.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // A fake project, so nothing can reach the real database even if a module reads these.
    env: {
      VITE_SUPABASE_URL: 'https://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // Dates are checked in the product's time zone, so results match on every machine.
      TZ: 'Africa/Cairo',
    },
    restoreMocks: true,
  },
});
