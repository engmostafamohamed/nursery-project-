// Realtime subscriptions in hooks: the effect that opens a channel must not depend on a query-key
// array built during render. That array is new on every render, so the channel would be closed and
// reopened each time (on every keystroke in a form using the hook) and events could be missed.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const hooksDir = __dirname;

/** Hooks whose `useEffect(..., [..., <name>])` opens a `.channel(` and lists a key built in render. */
function rebuiltKeyDependencies(code: string): string[] {
  const keyNames = [...code.matchAll(/const (\w+) = \w+(?:Key|QueryKey)\(/g)].map((m) => m[1]);
  const effects = [...code.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/g)];
  return effects
    .filter(([, body]) => body.includes('.channel('))
    .flatMap(([, , deps]) => deps.split(',').map((d) => d.trim()).filter((d) => keyNames.includes(d)));
}

describe('realtime channels in hooks', () => {
  const files = readdirSync(hooksDir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

  it('finds the hooks to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('opens each channel once per nursery, not once per render', () => {
    const offenders = files.flatMap((file) =>
      rebuiltKeyDependencies(readFileSync(path.join(hooksDir, file), 'utf8')).map((dep) => `${file}: ${dep}`),
    );
    expect(offenders).toEqual([]);
  });

  it('would catch the bug it guards against', () => {
    const buggy = `
      const key = packagesKey(nurseryId);
      useEffect(() => {
        const channel = supabase.channel('x').subscribe();
        return () => void supabase.removeChannel(channel);
      }, [nurseryId, queryClient, key]);`;
    expect(rebuiltKeyDependencies(buggy)).toEqual(['key']);
  });
});
