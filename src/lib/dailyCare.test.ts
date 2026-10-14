// Module 5 · Daily care & learning progress — how daily report answers are shown and shared.
import { describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';

import { formatActivityTag, formatMealSlot, formatMoodLabel, formatNapQuality } from './dailyReportDisplay';
import { formatMealsSummary, formatMoodSummary } from './parentDashboardFormat';
import { generateDailyReportShareText } from './reportShare';

const t = i18n.getFixedT('en');

describe('daily report answers', () => {
  it.each([
    [{ amount: 'all' }, 'All'],
    [{ amount: 'none' }, 'None'],
    [{ appetite: 'ate_all' }, 'All'],
    [{ appetite: 'did_not_eat' }, 'None'],
    [{ amount: 'a little' }, 'Some'],
    [undefined, 'Some'],
  ])('a meal of %o shows "%s"', (slot, label) => {
    expect(formatMealSlot(t, slot)).toBe(label);
  });

  it.each([
    ['good', 'Good'],
    ['slept_well', 'Good'],
    ['restless', 'Restless'],
    ['did_not_sleep', 'OK'],
    [null, 'OK'],
  ])('a nap of %s shows "%s"', (raw, label) => {
    expect(formatNapQuality(t, raw)).toBe(label);
  });

  it.each([
    ['happy', 'Happy'],
    ['neutral', 'Content'],
    ['sad', 'Fussy'],
    ['upset', 'Cranky'],
    ['', 'Happy'],
  ])('a mood of "%s" shows "%s"', (raw, label) => {
    expect(formatMoodLabel(t, raw)).toBe(label);
  });

  it('translates known activities and keeps unknown ones as typed', () => {
    expect(formatActivityTag(t, 'circle_time')).toBe('Circle time');
    expect(formatActivityTag(t, 'Pottery class')).toBe('Pottery class');
  });

  it('shows Arabic words for an Arabic reader', () => {
    const ar = i18n.getFixedT('ar');
    expect(formatMoodLabel(ar, 'happy')).not.toBe('Happy');
    expect(formatMoodLabel(ar, 'happy').trim()).not.toBe('');
  });
});

describe('parent dashboard summary', () => {
  it('reads the mood in either stored shape', () => {
    expect(formatMoodSummary({ mood: 'happy' })).toBe('happy');
    expect(formatMoodSummary({ mood: { mood: 'tired' } })).toBe('tired');
    expect(formatMoodSummary({ mood: '  ' })).toBe('');
    expect(formatMoodSummary(undefined)).toBe('');
  });

  it('lists only the meals that have an answer', () => {
    const meals = { breakfast: { appetite: 'all' }, lunch: {}, snacks: { appetite: 'some' } };
    expect(formatMealsSummary(meals)).toBe('B:all · S:some');
    expect(formatMealsSummary(undefined)).toBe('');
  });
});

describe('sharing a daily report', () => {
  it('writes one line per section', () => {
    const text = generateDailyReportShareText({
      childName: 'Adam',
      date: '14 Oct 2026',
      mood: 'Happy',
      meals: 'All',
      nap: 'Good',
      activities: 'Art, Music',
      teacherName: 'Ms. Mona',
    });
    expect(text.split('\n')).toEqual([
      "📋 Adam's Daily Report - 14 Oct 2026",
      '😊 Mood: Happy',
      '🍽️ Meals: All',
      '😴 Nap: Good',
      '🎨 Activities: Art, Music',
      'Teacher: Ms. Mona',
    ]);
  });
});
