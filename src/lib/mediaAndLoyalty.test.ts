// Module 11 · Media, content & community and Module 12 · Loyalty & rewards — upload checks and points.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { fakeDb } from '@/test/fakeSupabase';

import { awardReferralPoints, awardReviewPoints } from './loyaltyPoints';
import { mediaActivityLabel } from './mediaActivityLabels';
import { buildMediaPath, PHOTO_MAX_BYTES, validateMediaFile, VIDEO_MAX_BYTES } from './mediaStorage';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

const t = i18n.getFixedT('en');
const MB = 1024 * 1024;
/** validateMediaFile only reads the name and size, so a plain object stands in for a File. */
const file = (name: string, size: number) => ({ name, size }) as File;

describe('media uploads', () => {
  it.each([
    ['photo.JPG', 2 * MB, { ok: true, kind: 'photo' }],
    ['photo.heic', PHOTO_MAX_BYTES, { ok: true, kind: 'photo' }],
    ['photo.png', PHOTO_MAX_BYTES + 1, { ok: false, message: 'media.validation.photoTooLarge' }],
    ['clip.mov', 50 * MB, { ok: true, kind: 'video' }],
    ['clip.mp4', VIDEO_MAX_BYTES + 1, { ok: false, message: 'media.validation.videoTooLarge' }],
    ['notes.pdf', 1000, { ok: false, message: 'media.validation.invalidType' }],
    ['no-extension', 1000, { ok: false, message: 'media.validation.invalidType' }],
  ])('%s (%i bytes) → %o', (name, size, expected) => {
    expect(validateMediaFile(file(name, size))).toEqual(expected);
  });

  it('stores media under nursery, year and month, without spaces', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
    expect(buildMediaPath('n1', 'class trip photo.jpg')).toBe(`n1/2026/10/${Date.now()}-class-trip-photo.jpg`);
    vi.useRealTimers();
  });
});

describe('media activity labels', () => {
  it('translates current and legacy activity types', () => {
    expect(mediaActivityLabel(t, 'field_trip')).toBe('Field trip');
    expect(mediaActivityLabel(t, 'outdoor')).toBe('Outdoor play');
  });

  it('shows unknown or free-text types as they are, and a dash for none', () => {
    expect(mediaActivityLabel(t, 'pottery')).toBe('pottery');
    expect(mediaActivityLabel(t, 'Class trip!')).toBe('Class trip!');
    expect(mediaActivityLabel(t, null)).toBe('—');
  });
});

describe('loyalty points', () => {
  beforeEach(() => {
    fakeDb.reset();
  });
  afterEach(() => {
    fakeDb.reset();
  });

  const points = () =>
    fakeDb.inserted('loyalty_transactions').map((row) => {
      const r = row as { parent_id: string; points: number; transaction_type: string; source: string };
      return [r.parent_id, r.points, r.transaction_type, r.source];
    });

  it('gives 10 points for a written review, 5 for a reaction, none otherwise', async () => {
    const review = { nurseryId: 'n1', parentId: 'p1', referenceId: 'r1' };
    await awardReviewPoints({ ...review, hasText: true, hasReaction: true });
    await awardReviewPoints({ ...review, hasText: false, hasReaction: true });
    await awardReviewPoints({ ...review, hasText: false, hasReaction: false });
    expect(points()).toEqual([
      ['p1', 10, 'earned', 'review'],
      ['p1', 5, 'earned', 'review'],
    ]);
  });

  it('gives the referring parent 50 points and the new parent a 25-point bonus', async () => {
    await awardReferralPoints({ nurseryId: 'n1', referringParentId: 'p1', newParentId: 'p2', referenceId: 'ref-1' });
    expect(points()).toEqual([
      ['p1', 50, 'earned', 'referral'],
      ['p2', 25, 'bonus', 'referral'],
    ]);
    expect(fakeDb.inserted('loyalty_transactions')[0]).toMatchObject({ nursery_id: 'n1', reference_id: 'ref-1', description: null });
  });

  it('stops when the database refuses the write', async () => {
    fakeDb.failTable('loyalty_transactions', 'new row violates row-level security policy');
    await expect(
      awardReviewPoints({ nurseryId: 'n1', parentId: 'p1', referenceId: 'r1', hasText: true, hasReaction: false }),
    ).rejects.toMatchObject({ message: expect.stringContaining('row-level security') });
  });
});
