// Runs before every test file.
import { vi } from 'vitest';

// Unit tests never talk to Supabase. Any use of the client fails loudly with a hint, so a test
// that needs data has to stub the function it calls instead.
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`Unit tests must not call Supabase (tried supabase.${String(property)}). Mock it in the test.`);
      },
    },
  ),
}));
