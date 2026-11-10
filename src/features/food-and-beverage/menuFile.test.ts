import { describe, expect, it } from 'vitest';

import { menuFilePath, menuFileProblem } from './menuFile';

describe('the menu file', () => {
  it('is a photo or a PDF, and a photo may be large before it is made smaller', () => {
    expect(menuFileProblem({ type: 'application/pdf', size: 5 * 1024 * 1024 })).toBeNull();
    expect(menuFileProblem({ type: 'application/pdf', size: 5 * 1024 * 1024 + 1 })).toBe('too_large');
    expect(menuFileProblem({ type: 'image/jpeg', size: 12 * 1024 * 1024 })).toBeNull();
    expect(menuFileProblem({ type: 'image/heic', size: 1000 })).toBe('invalid_type');
    expect(menuFileProblem({ type: 'text/plain', size: 10 })).toBe('invalid_type');
  });

  it('is stored under the nursery and the first day of its period', () => {
    expect(menuFilePath('n1', '2026-11-01', 'application/pdf', 42)).toBe('n1/2026-11-01/42.pdf');
    expect(menuFilePath('n1', '2026-11-07', 'image/webp', 42)).toBe('n1/2026-11-07/42.webp');
  });
});
