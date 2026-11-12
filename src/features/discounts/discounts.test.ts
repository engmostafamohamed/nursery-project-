import { describe, expect, it } from 'vitest';

import {
  combineDiscounts,
  discountAmount,
  draftAliases,
  draftToPayload,
  emptyPartnerDraft,
  normalizeForMatch,
  partnerFormIssues,
  proofFileIssue,
  suggestPartners,
  toFamilyDiscounts,
  toPartner,
  toPartnersPage,
} from './discounts';

describe('discountAmount', () => {
  it('takes a percentage of the subtotal, or the amount, never more than the subtotal', () => {
    expect(discountAmount('percentage', 15, 1000)).toBe(150);
    expect(discountAmount('percentage', 12.5, 99.99)).toBe(12.5);
    expect(discountAmount('fixed_amount', 200, 1000)).toBe(200);
    expect(discountAmount('fixed_amount', 2000, 1000)).toBe(1000);
    expect(discountAmount('percentage', 10, -5)).toBe(0);
  });
});

describe('combineDiscounts (the same rule as the database)', () => {
  it('keeps every discount while together they stay under the cap', () => {
    const lines = combineDiscounts(1000, [{ source: 'sibling', amount: 100 }, { source: 'partnership', amount: 150 }], 30);
    expect(lines.map((l) => [l.source, l.taken, l.capped])).toEqual([
      ['partnership', 150, false],
      ['sibling', 100, false],
    ]);
  });

  it('cuts the smaller ones at the cap, and drops one the cap leaves nothing for', () => {
    const lines = combineDiscounts(
      1000,
      [{ source: 'partnership', amount: 150 }, { source: 'sibling', amount: 100 }, { source: 'deal', amount: 50 }],
      20,
    );
    expect(lines.map((l) => [l.source, l.taken, l.capped])).toEqual([
      ['partnership', 150, false],
      ['sibling', 50, true],
    ]);
  });

  it('lets a single discount larger than the cap apply alone', () => {
    const lines = combineDiscounts(1000, [{ source: 'deal', amount: 500 }, { source: 'partnership', amount: 150 }], 30);
    expect(lines.map((l) => [l.source, l.taken])).toEqual([['deal', 500]]);
  });

  it('never takes more than the subtotal, and nothing off a free charge', () => {
    expect(combineDiscounts(100, [{ source: 'deal', amount: 300 }], 30)[0].taken).toBe(100);
    expect(combineDiscounts(0, [{ source: 'deal', amount: 300 }], 30)).toEqual([]);
  });

  it('breaks a tie the way the database does (by source name)', () => {
    const lines = combineDiscounts(1000, [{ source: 'sibling', amount: 100 }, { source: 'partnership', amount: 100 }], 15);
    expect(lines.map((l) => [l.source, l.taken])).toEqual([
      ['partnership', 100],
      ['sibling', 50],
    ]);
  });
});

describe('suggestPartners', () => {
  const offers = [
    { id: 'v', nameAr: 'فودافون', nameEn: 'Vodafone', aliases: ['Vodafone Egypt'] },
    { id: 'n', nameAr: 'مدرسة النيل', nameEn: 'Nile School', aliases: [] },
    { id: 'b', nameAr: 'البنك الأهلي', nameEn: 'National Bank', aliases: ['NBE'] },
  ];

  it('finds the partner named in a job, in either language and any case', () => {
    expect(suggestPartners(['Software engineer at VODAFONE'], offers).map((o) => o.id)).toEqual(['v']);
    expect(suggestPartners(['مهندس في فودافون'], offers).map((o) => o.id)).toEqual(['v']);
    expect(suggestPartners(['Teacher', 'accountant, nbe'], offers).map((o) => o.id)).toEqual(['b']);
  });

  it('reads Arabic letter variants as the same word', () => {
    expect(suggestPartners(['موظفة في البنك الاهلى'], offers).map((o) => o.id)).toEqual(['b']);
    expect(normalizeForMatch('مدرسةُ النيلِ')).toBe('مدرسه النيل');
  });

  it('suggests a partner that starts with what was written', () => {
    expect(suggestPartners(['Voda'], offers).map((o) => o.id)).toEqual(['v']);
  });

  it('says nothing for an empty or unrelated job', () => {
    expect(suggestPartners(['', null, undefined], offers)).toEqual([]);
    expect(suggestPartners(['Doctor'], offers)).toEqual([]);
  });
});

describe('the partner form', () => {
  const draft = { ...emptyPartnerDraft('2026-11-11'), nameEn: 'Vodafone' };

  it('accepts a complete partner', () => {
    expect(partnerFormIssues(draft)).toEqual({});
  });

  it('shows each problem under its field', () => {
    expect(partnerFormIssues({ ...draft, nameEn: ' ', nameAr: '' }).name).toBe('nameRequired');
    expect(partnerFormIssues({ ...draft, discountValue: '0' }).discountValue).toBe('valuePositive');
    expect(partnerFormIssues({ ...draft, discountValue: '120' }).discountValue).toBe('percentMax');
    expect(partnerFormIssues({ ...draft, discountType: 'fixed_amount', discountValue: '120' }).discountValue).toBeUndefined();
    expect(partnerFormIssues({ ...draft, appliesTo: [] }).appliesTo).toBe('appliesToRequired');
    expect(partnerFormIssues({ ...draft, endsOn: '2026-11-01' }).dates).toBe('endBeforeStart');
    expect(partnerFormIssues({ ...draft, maxFamilies: '2.5' }).maxFamilies).toBe('maxFamiliesInvalid');
    expect(partnerFormIssues({ ...draft, maxFamilies: '0' }).maxFamilies).toBe('maxFamiliesInvalid');
    expect(partnerFormIssues({ ...draft, contactEmail: 'hr@' }).contactEmail).toBe('emailInvalid');
    expect(partnerFormIssues({ ...draft, offerDetailsEn: 'x'.repeat(601) }).texts).toBe('tooLong');
  });

  it('splits other names on commas (either kind) and lines, without repeats', () => {
    expect(draftAliases({ aliases: 'Vodafone Egypt, فودافون مصر،\nvodafone egypt\n ' })).toEqual(['Vodafone Egypt', 'فودافون مصر']);
  });

  it('sends what the server takes', () => {
    const payload = draftToPayload({ ...draft, maxFamilies: '', endsOn: '', discountValue: '15' });
    expect(payload).toMatchObject({ name_en: 'Vodafone', discount_value: 15, max_families: null, ends_on: null, applies_to: ['tuition'] });
  });

  it('accepts a photo or a PDF proof up to 5 MB', () => {
    expect(proofFileIssue({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(proofFileIssue({ type: 'text/plain', size: 10 })).toBe('proofType');
    expect(proofFileIssue({ type: 'image/png', size: 6 * 1024 * 1024 })).toBe('proofSize');
  });
});

describe('reading the server', () => {
  it('reads a partner, with safe defaults for anything missing', () => {
    const partner = toPartner({ id: 'p', kind: 'bank', name_en: 'X', applies_to: ['extra_hours', 'other'], discount_value: '12.5', state: 'odd' });
    expect(partner).toMatchObject({ kind: 'company', appliesTo: ['extra_hours'], discountValue: 12.5, state: 'active', requiresProof: true, maxFamilies: null });
  });

  it('reads the partners page and a family\'s discounts', () => {
    expect(toPartnersPage({ can_manage: true, partners: [{ id: 'a' }, 'junk'] }).partners).toHaveLength(1);
    const family = toFamilyDiscounts({
      max_total_percentage: 25,
      partnerships: [{ id: 'b', state: 'pending', partner: { id: 'p', name_en: 'Vodafone' } }],
      sibling: { enabled: true, second_percentage: 10, children: [{ child_id: 'c', rank: 2 }] },
    });
    expect(family.maxTotalPercentage).toBe(25);
    expect(family.partnerships[0].partner?.nameEn).toBe('Vodafone');
    expect(family.sibling.children[0].rank).toBe(2);
  });
});
