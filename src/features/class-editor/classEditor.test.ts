import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import { candidatesIn, classDraft, classEditorErrorKey, draftIssues, placesAfter, sameDraft, searchChildren, toClassEditor, type Candidate } from './classEditor';

describe('the class’s details', () => {
  const others = [{ nameAr: 'النحل', nameEn: 'Bees' }];

  it('need a name in one language, free in the nursery, short texts and 1–100 places', () => {
    const blank = classDraft(null);
    expect(draftIssues(blank, others)).toEqual({ nameAr: 'name_required', nameEn: 'name_required' });
    expect(draftIssues({ ...blank, nameEn: ' bees ' }, others)).toEqual({ nameEn: 'name_taken' });
    expect(draftIssues({ ...blank, nameAr: 'ا'.repeat(61) }, others)).toEqual({ nameAr: 'name_too_long' });
    expect(draftIssues({ ...blank, nameAr: 'النجوم', gradeLevel: 'x'.repeat(41), roomNumber: 'y'.repeat(21) }, others)).toEqual({ gradeLevel: 'too_long', roomNumber: 'too_long' });
    for (const bad of ['0', '101', '2.5', 'ten']) {
      expect(draftIssues({ ...blank, nameAr: 'النجوم', capacity: bad }, others), bad).toEqual({ capacity: 'capacity_invalid' });
    }
    expect(draftIssues({ ...blank, nameAr: 'النجوم', capacity: '25' }, others)).toEqual({});
  });

  it('knows when nothing changed', () => {
    const cls = { id: 'c', nameAr: 'النجوم', nameEn: 'Stars', gradeLevel: null, roomNumber: 'G1', capacity: 20 };
    expect(sameDraft(classDraft(cls), { ...classDraft(cls), nameEn: ' Stars ' })).toBe(true);
    expect(sameDraft(classDraft(cls), { ...classDraft(cls), capacity: '21' })).toBe(false);
  });

  it('counts the places after adding', () => {
    expect(placesAfter(24, 3, 25)).toEqual({ after: 27, over: 2 });
    expect(placesAfter(20, 3, 25)).toEqual({ after: 23, over: 0 });
    expect(placesAfter(20, 3, null)).toEqual({ after: 23, over: 0 });
  });
});

describe('the lists', () => {
  const kid = (over: Partial<Candidate>): Candidate => ({
    id: 'x', nameAr: '', nameEn: '', code: null, dob: null, gender: null, avatarUrl: null, enrolledOn: null, classId: null, classAr: null, classEn: null, ...over,
  });
  const kids = [
    kid({ id: '1', nameAr: 'ليلى', nameEn: 'Laila Ahmed', code: 'CH-01' }),
    kid({ id: '2', nameAr: 'آدم', nameEn: 'Adam', classId: 'k', classEn: 'Bees' }),
  ];

  it('searches every word in either name or the code', () => {
    expect(searchChildren(kids, 'laila ahm').map((c) => c.id)).toEqual(['1']);
    expect(searchChildren(kids, 'ch-01').map((c) => c.id)).toEqual(['1']);
    expect(searchChildren(kids, 'آدم').map((c) => c.id)).toEqual(['2']);
    expect(searchChildren(kids, '').length).toBe(2);
  });

  it('shows children without a class, or all of them', () => {
    expect(candidatesIn(kids, 'unassigned', '').map((c) => c.id)).toEqual(['1']);
    expect(candidatesIn(kids, 'all', '').map((c) => c.id)).toEqual(['1', '2']);
  });

  it('reads get_class_editor defensively', () => {
    const e = toClassEditor({
      nursery_id: 'n', today: '2026-11-10', can: { create: true, update: true },
      class: { id: 'c', name_ar: 'النجوم', name_en: 'Stars', capacity: '20' },
      children: [{ id: '1', gender: 'other', dob: '2023-01-01' }],
      candidates: [{ id: '2', class_id: 'k', class_en: 'Bees' }],
      classes: [{ id: 'k', name_en: 'Bees', children: '3' }],
      grade_levels: ['KG1', '', 3],
    });
    expect(e.can).toEqual({ create: true, update: true, delete: false });
    expect(e.cls).toMatchObject({ id: 'c', capacity: 20 });
    expect(e.children[0]).toMatchObject({ gender: null, dob: '2023-01-01' });
    expect(e.candidates[0]).toMatchObject({ classId: 'k', classEn: 'Bees' });
    expect(e.classes[0].children).toBe(3);
    expect(e.gradeLevels).toEqual(['KG1']);
    expect(toClassEditor({ class: null }).cls).toBeNull();
  });

  it('names a refused call', () => {
    expect(classEditorErrorKey({ message: 'class_over_capacity' })).toBe('classEditor.errors.over_capacity');
    expect(classEditorErrorKey({ message: 'class_name_taken' })).toBe('classEditor.errors.name_taken');
    expect(classEditorErrorKey({ message: 'Failed to fetch' })).toBe('classEditor.errors.network');
    expect(classEditorErrorKey({ message: '??' })).toBe('classEditor.errors.failed');
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      ...['name_required', 'name_too_long', 'name_taken', 'too_long', 'capacity_invalid'].map((k) => `classEditor.issues.${k}`),
      ...['forbidden', 'not_found', 'name_required', 'name_taken', 'text_too_long', 'capacity_invalid', 'children_invalid', 'over_capacity', 'has_children', 'network', 'failed']
        .map((k) => `classEditor.errors.${k}`),
      'classEditor.newTitle', 'classEditor.editTitle', 'classEditor.add.title', 'classEditor.move.titleOne', 'classEditor.delete.title', 'classEditor.remove.titleOne',
      'classEditor.roster.title', 'classEditor.picker.unassigned', 'classEditor.over.confirm', 'classEditor.gender.male', 'classEditor.gender.female',
      'notificationTemplates.child_class_changed.title', 'notificationTemplates.child_class_changed.body',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
  });
});
