import { describe, expect, it } from 'vitest';

import { toggled } from './listToggle';

describe('toggling a value in a list', () => {
  it('adds it, or takes it out when it is there', () => {
    expect(toggled([1, 2], 2)).toEqual([1]);
    expect(toggled([1], 3)).toEqual([1, 3]);
  });
});
