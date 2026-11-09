import { describe, expect, it } from 'vitest';

import { nameLines, nameText } from './bilingualName';
import { count, day, list, numberOrNull, obj, oneOf, text, textOrNull } from './jsonRead';

describe('reading a database answer', () => {
  it('gives a safe default for anything missing or of the wrong kind', () => {
    expect(obj(null)).toEqual({});
    expect(obj([1])).toEqual({});
    expect(list({ a: 1 })).toEqual([]);
    expect(list([{ a: 1 }, null, 2, 'x', [3]])).toEqual([{ a: 1 }]);
    expect(text(5)).toBe('');
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull('x')).toBe('x');
    expect(count('3')).toBe(3);
    expect(count(-2)).toBe(0);
    expect(count('nope')).toBe(0);
    expect(count(2.9)).toBe(2);
    expect(numberOrNull(null)).toBeNull();
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('25')).toBe(25);
    expect(numberOrNull('x')).toBeNull();
    expect(day('2026-11-09T22:00:00Z')).toBe('2026-11-09');
    expect(day(null)).toBe('');
    expect(oneOf('b', ['a', 'b'] as const, 'a')).toBe('b');
    expect(oneOf('z', ['a', 'b'] as const, 'a')).toBe('a');
  });
});

describe('names in Arabic and English', () => {
  it('follows the nursery’s language setting', () => {
    expect(nameLines('الفراشات', 'Butterflies', 'ar', false)).toEqual({ primary: 'الفراشات', secondary: '' });
    expect(nameLines('الفراشات', 'Butterflies', 'en', true)).toEqual({ primary: 'Butterflies', secondary: '' });
    expect(nameLines('', 'Butterflies', 'ar', true)).toEqual({ primary: 'Butterflies', secondary: '' });
  });

  it('with both, puts the reader’s language first and shows a name once when the two are the same', () => {
    expect(nameLines('الفراشات', 'Butterflies', 'both', true)).toEqual({ primary: 'الفراشات', secondary: 'Butterflies' });
    expect(nameLines('الفراشات', 'Butterflies', 'both', false)).toEqual({ primary: 'Butterflies', secondary: 'الفراشات' });
    expect(nameLines('A2', 'A2', 'both', false)).toEqual({ primary: 'A2', secondary: '' });
    expect(nameLines(null, undefined, 'both', false)).toEqual({ primary: '—', secondary: '' });
  });

  it('on one line joins the two names', () => {
    expect(nameText('الفراشات', 'Butterflies', 'both')).toBe('الفراشات / Butterflies');
    expect(nameText('A2', 'A2', 'both')).toBe('A2');
    expect(nameText('الفراشات', 'Butterflies', 'en')).toBe('Butterflies');
    expect(nameText('', '', 'ar')).toBe('—');
  });
});
