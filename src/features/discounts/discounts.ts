/*
 * Discounts from every side, as the screens use them: the partners a nursery has an agreement with
 * (companies, schools, organizations), the families who have a partner's discount or asked for it,
 * a family's discounts, and what the invoices took off. The server works out every amount; the same
 * rule is here only for the price a family sees before it signs up (combineDiscounts, mirroring the
 * database's discount_lines).
 */
import { count, day, list, numberOrNull, obj, oneOf, text, textOrNull, type JsonRecord } from '@/lib/jsonRead';

export const PARTNER_KINDS = ['company', 'school', 'organization'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** What a partner's discount applies to. */
export const PARTNER_APPLIES = ['tuition', 'extra_hours'] as const;
export type PartnerApplies = (typeof PARTNER_APPLIES)[number];

export const PARTNER_STATES = ['active', 'ending_soon', 'scheduled', 'expired', 'paused'] as const;
export type PartnerState = (typeof PARTNER_STATES)[number];

export const BENEFICIARY_STATES = ['pending', 'active', 'scheduled', 'ended', 'rejected'] as const;
export type BeneficiaryState = (typeof BENEFICIARY_STATES)[number];

export type Names = { ar: string; en: string };

export type DiscountPartner = {
  id: string;
  /** A branch's own partner, or one for every branch of the chain. */
  scope: 'branch' | 'chain';
  kind: PartnerKind;
  nameAr: string;
  nameEn: string;
  /** Other names families may write for their workplace ("Vodafone Egypt", "فودافون"). */
  aliases: string[];
  offerDetailsAr: string | null;
  offerDetailsEn: string | null;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: PartnerApplies[];
  startsOn: string;
  endsOn: string | null;
  requiresProof: boolean;
  proofNoteAr: string | null;
  proofNoteEn: string | null;
  maxFamilies: number | null;
  active: boolean;
  state: PartnerState;
  /** Only for those who manage it. */
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  agreementRef: string | null;
  /** This branch's families with it now (or from a later day), and waiting for a decision. */
  activeFamilies: number;
  pendingFamilies: number;
  /** Families everywhere it reaches, counted against its limit. */
  openFamilies: number;
  /** What it has taken off this branch's invoices so far. */
  given: number;
  canEdit: boolean;
  /** Its family limit is reached: no new claims. */
  full: boolean;
};

export type FamilyRef = {
  parentId: string;
  nameAr: string;
  nameEn: string;
  phone: string | null;
  email: string | null;
  children: { id: string; nameAr: string; nameEn: string }[];
};

export type PartnerBeneficiary = {
  id: string;
  partnerId: string;
  status: 'pending' | 'active' | 'rejected' | 'ended';
  state: BeneficiaryState;
  validFrom: string;
  validTo: string | null;
  /** The earlier of its own last day and the agreement's end. */
  endsOn: string | null;
  proofPath: string | null;
  proofName: string | null;
  claimedAt: string;
  /** The family asked for it (at signup or from its invoices), not added by the nursery. */
  claimedByFamily: boolean;
  decidedAt: string | null;
  decidedBy: Names | null;
  decisionNote: string | null;
  applicationId: string | null;
  given: number;
  family: FamilyRef;
  /** On a family's own list. */
  partner: DiscountPartner | null;
};

export type PartnersPage = {
  today: string;
  canManage: boolean;
  canManageChain: boolean;
  hasChain: boolean;
  partners: DiscountPartner[];
};

export type PartnerDetail = {
  today: string;
  canManage: boolean;
  canEdit: boolean;
  partner: DiscountPartner;
  beneficiaries: PartnerBeneficiary[];
};

export type SiblingDiscount = {
  enabled: boolean;
  secondPercentage: number;
  thirdPercentage: number;
  /** The family's enrolled children in order: the first pays in full. */
  children: { childId: string; nameAr: string; nameEn: string; rank: number }[];
};

export type FamilyDiscounts = {
  today: string;
  canManage: boolean;
  maxTotalPercentage: number;
  partnerships: PartnerBeneficiary[];
  sibling: SiblingDiscount;
};

export type DiscountSource = 'deal' | 'partnership' | 'sibling';

export type DiscountReport = {
  from: string;
  to: string;
  total: number;
  invoices: number;
  families: number;
  bySource: Record<DiscountSource | 'other', number>;
  byPartner: { partnerId: string; nameAr: string; nameEn: string; kind: PartnerKind; amount: number; families: number; invoices: number }[];
  byDeal: { dealId: string; nameAr: string; nameEn: string; amount: number; families: number; invoices: number }[];
  byMonth: { month: string; deal: number; partnership: number; sibling: number; other: number }[];
};

const money = (value: unknown): number => numberOrNull(value) ?? 0;

function names(value: unknown): Names | null {
  const raw = obj(value);
  const ar = text(raw.ar).trim();
  const en = text(raw.en).trim();
  return ar || en ? { ar, en } : null;
}

export function toPartner(raw: unknown): DiscountPartner {
  const p = obj(raw);
  return {
    id: text(p.id),
    scope: p.scope === 'chain' ? 'chain' : 'branch',
    kind: oneOf(p.kind, PARTNER_KINDS, 'company'),
    nameAr: text(p.name_ar),
    nameEn: text(p.name_en),
    aliases: Array.isArray(p.aliases) ? p.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : [],
    offerDetailsAr: textOrNull(p.offer_details_ar),
    offerDetailsEn: textOrNull(p.offer_details_en),
    discountType: oneOf(p.discount_type, DISCOUNT_TYPES, 'percentage'),
    discountValue: money(p.discount_value),
    appliesTo: Array.isArray(p.applies_to)
      ? PARTNER_APPLIES.filter((scope) => (p.applies_to as unknown[]).includes(scope))
      : ['tuition'],
    startsOn: day(p.starts_on),
    endsOn: day(p.ends_on) || null,
    requiresProof: p.requires_proof !== false,
    proofNoteAr: textOrNull(p.proof_note_ar),
    proofNoteEn: textOrNull(p.proof_note_en),
    maxFamilies: numberOrNull(p.max_families),
    active: p.active !== false,
    state: oneOf(p.state, PARTNER_STATES, 'active'),
    contactName: textOrNull(p.contact_name),
    contactPhone: textOrNull(p.contact_phone),
    contactEmail: textOrNull(p.contact_email),
    agreementRef: textOrNull(p.agreement_ref),
    activeFamilies: count(p.active_families),
    pendingFamilies: count(p.pending_families),
    openFamilies: count(p.open_families),
    given: money(p.given),
    canEdit: p.can_edit === true,
    full: p.full === true,
  };
}

function toFamily(raw: unknown): FamilyRef {
  const f = obj(raw);
  return {
    parentId: text(f.parent_id),
    nameAr: text(f.name_ar),
    nameEn: text(f.name_en),
    phone: textOrNull(f.phone),
    email: textOrNull(f.email),
    children: list(f.children).map((c) => ({ id: text(c.id), nameAr: text(c.name_ar), nameEn: text(c.name_en) })),
  };
}

export function toBeneficiary(raw: unknown): PartnerBeneficiary {
  const b = obj(raw);
  return {
    id: text(b.id),
    partnerId: text(b.partner_id),
    status: oneOf(b.status, ['pending', 'active', 'rejected', 'ended'] as const, 'pending'),
    state: oneOf(b.state, BENEFICIARY_STATES, 'pending'),
    validFrom: day(b.valid_from),
    validTo: day(b.valid_to) || null,
    endsOn: day(b.ends_on) || null,
    proofPath: textOrNull(b.proof_path),
    proofName: textOrNull(b.proof_name),
    claimedAt: text(b.claimed_at),
    claimedByFamily: b.claimed_by_family === true,
    decidedAt: textOrNull(b.decided_at),
    decidedBy: names(b.decided_by),
    decisionNote: textOrNull(b.decision_note),
    applicationId: textOrNull(b.application_id),
    given: money(b.given),
    family: toFamily(b.family),
    partner: b.partner ? toPartner(b.partner) : null,
  };
}

export function toPartnersPage(raw: unknown): PartnersPage {
  const r = obj(raw);
  return {
    today: day(r.today),
    canManage: r.can_manage === true,
    canManageChain: r.can_manage_chain === true,
    hasChain: r.has_chain === true,
    partners: list(r.partners).map(toPartner),
  };
}

export function toPartnerDetail(raw: unknown): PartnerDetail {
  const r = obj(raw);
  return {
    today: day(r.today),
    canManage: r.can_manage === true,
    canEdit: r.can_edit === true,
    partner: toPartner(r.partner),
    beneficiaries: list(r.beneficiaries).map(toBeneficiary),
  };
}

export function toFamilyDiscounts(raw: unknown): FamilyDiscounts {
  const r = obj(raw);
  const s = obj(r.sibling);
  return {
    today: day(r.today),
    canManage: r.can_manage === true,
    maxTotalPercentage: numberOrNull(r.max_total_percentage) ?? 30,
    partnerships: list(r.partnerships).map(toBeneficiary),
    sibling: {
      enabled: s.enabled === true,
      secondPercentage: money(s.second_percentage),
      thirdPercentage: money(s.third_percentage),
      children: list(s.children).map((c) => ({ childId: text(c.child_id), nameAr: text(c.name_ar), nameEn: text(c.name_en), rank: count(c.rank) })),
    },
  };
}

export const toFamilies = (raw: unknown): FamilyRef[] => list(raw).map(toFamily);
export const toOffers = (raw: unknown): DiscountPartner[] => list(raw).map(toPartner);

export function toDiscountReport(raw: unknown): DiscountReport {
  const r = obj(raw);
  const s = obj(r.by_source);
  const reached = (row: JsonRecord) => ({ amount: money(row.amount), families: count(row.families), invoices: count(row.invoices) });
  return {
    from: day(r.from),
    to: day(r.to),
    total: money(r.total),
    invoices: count(r.invoices),
    families: count(r.families),
    bySource: { deal: money(s.deal), partnership: money(s.partnership), sibling: money(s.sibling), other: money(s.other) },
    byPartner: list(r.by_partner).map((row) => ({
      partnerId: text(row.partner_id),
      nameAr: text(row.name_ar),
      nameEn: text(row.name_en),
      kind: oneOf(row.kind, PARTNER_KINDS, 'company'),
      ...reached(row),
    })),
    byDeal: list(r.by_deal).map((row) => ({ dealId: text(row.deal_id), nameAr: text(row.name_ar), nameEn: text(row.name_en), ...reached(row) })),
    byMonth: list(r.by_month).map((row) => ({
      month: text(row.month),
      deal: money(row.deal),
      partnership: money(row.partnership),
      sibling: money(row.sibling),
      other: money(row.other),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// The amounts (the price a family sees before signing up)

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A discount on a subtotal: a percentage of it or the amount, never more than the subtotal. */
export function discountAmount(type: DiscountType, value: number, subtotal: number): number {
  const base = Math.max(subtotal, 0);
  const raw = type === 'percentage' ? round2((base * value) / 100) : round2(value);
  return Math.max(Math.min(raw, base), 0);
}

export type DiscountCandidate = { source: DiscountSource; amount: number };

/**
 * The family's discounts on one charge, together: the largest counts in full, the others only up to
 * the nursery's cap on combined discounts (a single discount above the cap is not cut). Each comes
 * back with what it actually takes off; the ones the cap leaves nothing for are dropped.
 */
export function combineDiscounts<T extends DiscountCandidate>(
  subtotal: number,
  candidates: readonly T[],
  capPercent: number,
): (T & { taken: number; capped: boolean })[] {
  const base = round2(Math.max(subtotal, 0));
  if (base <= 0) return [];
  let cap = round2((base * capPercent) / 100);
  let used = 0;
  const out: (T & { taken: number; capped: boolean })[] = [];
  const ordered = [...candidates].sort((a, b) => b.amount - a.amount || a.source.localeCompare(b.source));
  for (const candidate of ordered) {
    let taken: number;
    if (used === 0) {
      taken = Math.min(candidate.amount, base);
      cap = Math.max(cap, taken);
    } else {
      taken = Math.min(candidate.amount, Math.max(round2(cap - used), 0));
    }
    if (taken <= 0) continue;
    used = round2(used + taken);
    out.push({ ...candidate, taken: round2(taken), capped: taken < candidate.amount });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Where a family works

/** Text compared without case, Arabic letter variants, diacritics or punctuation. */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The offers a family's jobs point to ("Engineer at Vodafone" → Vodafone): a partner whose name or
 * other name appears in what they wrote, or that starts with it. Best matches first.
 */
export function suggestPartners<T extends Pick<DiscountPartner, 'id' | 'nameAr' | 'nameEn' | 'aliases'>>(
  jobs: readonly (string | null | undefined)[],
  offers: readonly T[],
): T[] {
  const texts = jobs.map((job) => normalizeForMatch(job ?? '')).filter((job) => job.length >= 3);
  if (!texts.length) return [];
  const scored = offers
    .map((offer) => {
      const namesOf = [offer.nameAr, offer.nameEn, ...offer.aliases].map(normalizeForMatch).filter((name) => name.length >= 3);
      let score = 0;
      for (const job of texts) {
        for (const name of namesOf) {
          const padded = ` ${job} `;
          if (padded.includes(` ${name} `)) score = Math.max(score, 3);
          else if (job.includes(name)) score = Math.max(score, 2);
          else if (job.length >= 4 && name.startsWith(job)) score = Math.max(score, 1);
        }
      }
      return { offer, score };
    })
    .filter((row) => row.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((row) => row.offer);
}

// ---------------------------------------------------------------------------------------------
// The partner form

export type PartnerDraft = {
  kind: PartnerKind;
  scope: 'branch' | 'chain';
  nameAr: string;
  nameEn: string;
  /** One per line or separated by commas. */
  aliases: string;
  offerDetailsAr: string;
  offerDetailsEn: string;
  discountType: DiscountType;
  discountValue: string;
  appliesTo: PartnerApplies[];
  startsOn: string;
  endsOn: string;
  requiresProof: boolean;
  proofNoteAr: string;
  proofNoteEn: string;
  maxFamilies: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  agreementRef: string;
  active: boolean;
};

export const PARTNER_FIELDS = [
  'name',
  'aliases',
  'discountValue',
  'appliesTo',
  'dates',
  'maxFamilies',
  'contactEmail',
  'texts',
] as const;
export type PartnerField = (typeof PARTNER_FIELDS)[number];

/** What is wrong with each field, as a text key under discounts.form.errors. */
export type PartnerIssues = Partial<Record<PartnerField, string>>;

export function emptyPartnerDraft(today: string): PartnerDraft {
  return {
    kind: 'company',
    scope: 'branch',
    nameAr: '',
    nameEn: '',
    aliases: '',
    offerDetailsAr: '',
    offerDetailsEn: '',
    discountType: 'percentage',
    discountValue: '10',
    appliesTo: ['tuition'],
    startsOn: today,
    endsOn: '',
    requiresProof: true,
    proofNoteAr: '',
    proofNoteEn: '',
    maxFamilies: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    agreementRef: '',
    active: true,
  };
}

export function partnerToDraft(partner: DiscountPartner): PartnerDraft {
  return {
    kind: partner.kind,
    scope: partner.scope,
    nameAr: partner.nameAr,
    nameEn: partner.nameEn,
    aliases: partner.aliases.join(', '),
    offerDetailsAr: partner.offerDetailsAr ?? '',
    offerDetailsEn: partner.offerDetailsEn ?? '',
    discountType: partner.discountType,
    discountValue: String(partner.discountValue),
    appliesTo: partner.appliesTo,
    startsOn: partner.startsOn,
    endsOn: partner.endsOn ?? '',
    requiresProof: partner.requiresProof,
    proofNoteAr: partner.proofNoteAr ?? '',
    proofNoteEn: partner.proofNoteEn ?? '',
    maxFamilies: partner.maxFamilies === null ? '' : String(partner.maxFamilies),
    contactName: partner.contactName ?? '',
    contactPhone: partner.contactPhone ?? '',
    contactEmail: partner.contactEmail ?? '',
    agreementRef: partner.agreementRef ?? '',
    active: partner.active,
  };
}

export function draftAliases(draft: Pick<PartnerDraft, 'aliases'>): string[] {
  const seen = new Set<string>();
  return draft.aliases
    .split(/[,،\n]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias && !seen.has(alias.toLowerCase()) && seen.add(alias.toLowerCase()));
}

const LIMITS = { name: 120, offer: 600, proof: 200, contactName: 120, contactPhone: 40, contactEmail: 160, agreementRef: 80, alias: 60 };

/** The same checks the server makes, so each problem shows under its field before saving. */
export function partnerFormIssues(draft: PartnerDraft): PartnerIssues {
  const issues: PartnerIssues = {};
  if (!draft.nameAr.trim() && !draft.nameEn.trim()) issues.name = 'nameRequired';
  else if (draft.nameAr.trim().length > LIMITS.name || draft.nameEn.trim().length > LIMITS.name) issues.name = 'tooLong';

  const aliases = draftAliases(draft);
  if (aliases.length > 12) issues.aliases = 'tooManyAliases';
  else if (aliases.some((alias) => alias.length > LIMITS.alias)) issues.aliases = 'tooLong';

  const value = Number(draft.discountValue);
  if (draft.discountValue.trim() === '' || !Number.isFinite(value) || value <= 0) issues.discountValue = 'valuePositive';
  else if (draft.discountType === 'percentage' && value > 100) issues.discountValue = 'percentMax';
  else if (value > 1_000_000) issues.discountValue = 'valueTooLarge';

  if (draft.appliesTo.length === 0) issues.appliesTo = 'appliesToRequired';

  if (!draft.startsOn) issues.dates = 'startRequired';
  else if (draft.endsOn && draft.endsOn < draft.startsOn) issues.dates = 'endBeforeStart';

  if (draft.maxFamilies.trim() !== '') {
    const max = Number(draft.maxFamilies);
    if (!Number.isInteger(max) || max < 1) issues.maxFamilies = 'maxFamiliesInvalid';
  }

  const email = draft.contactEmail.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) issues.contactEmail = 'emailInvalid';
  else if (email.length > LIMITS.contactEmail) issues.contactEmail = 'tooLong';

  if (
    draft.offerDetailsAr.length > LIMITS.offer ||
    draft.offerDetailsEn.length > LIMITS.offer ||
    draft.proofNoteAr.length > LIMITS.proof ||
    draft.proofNoteEn.length > LIMITS.proof ||
    draft.contactName.length > LIMITS.contactName ||
    draft.contactPhone.length > LIMITS.contactPhone ||
    draft.agreementRef.length > LIMITS.agreementRef
  ) {
    issues.texts = 'tooLong';
  }
  return issues;
}

/** The payload save_discount_partner takes. */
export function draftToPayload(draft: PartnerDraft): Record<string, unknown> {
  return {
    kind: draft.kind,
    scope: draft.scope,
    name_ar: draft.nameAr.trim(),
    name_en: draft.nameEn.trim(),
    aliases: draftAliases(draft),
    offer_details_ar: draft.offerDetailsAr.trim(),
    offer_details_en: draft.offerDetailsEn.trim(),
    discount_type: draft.discountType,
    discount_value: Number(draft.discountValue),
    applies_to: draft.appliesTo,
    starts_on: draft.startsOn,
    ends_on: draft.endsOn || null,
    requires_proof: draft.requiresProof,
    proof_note_ar: draft.proofNoteAr.trim(),
    proof_note_en: draft.proofNoteEn.trim(),
    max_families: draft.maxFamilies.trim() === '' ? null : Number(draft.maxFamilies),
    contact_name: draft.contactName.trim(),
    contact_phone: draft.contactPhone.trim(),
    contact_email: draft.contactEmail.trim(),
    agreement_ref: draft.agreementRef.trim(),
    active: draft.active,
  };
}

/** The server's refusals, and the field each belongs under (none: shown above the buttons). */
export const PARTNER_ERROR_CODES = [
  'partner_not_found',
  'partner_scope_invalid',
  'partner_forbidden',
  'partner_kind_invalid',
  'partner_name_required',
  'partner_text_too_long',
  'partner_value_invalid',
  'partner_applies_to_required',
  'partner_dates_invalid',
  'partner_max_families_invalid',
  'partner_email_invalid',
  'partner_not_available',
  'partner_already_claimed',
  'partner_full',
  'partner_proof_required',
  'partner_proof_invalid',
  'partner_claim_not_found',
  'partner_claim_not_pending',
  'partner_claim_not_active',
  'partner_reason_required',
  'partner_family_not_found',
] as const;
export type PartnerErrorCode = (typeof PARTNER_ERROR_CODES)[number];

export const PARTNER_ERROR_FIELD: Partial<Record<PartnerErrorCode, PartnerField>> = {
  partner_name_required: 'name',
  partner_text_too_long: 'texts',
  partner_value_invalid: 'discountValue',
  partner_applies_to_required: 'appliesTo',
  partner_dates_invalid: 'dates',
  partner_max_families_invalid: 'maxFamilies',
  partner_email_invalid: 'contactEmail',
};

/** Partners a family can be given now: running or about to start, with room left. */
export const grantablePartners = (partners: readonly DiscountPartner[]) =>
  partners.filter(
    (p) => (p.state === 'active' || p.state === 'ending_soon' || p.state === 'scheduled') && !(p.maxFamilies !== null && p.openFamilies >= p.maxFamilies),
  );

// ---------------------------------------------------------------------------------------------
// How states read

export function partnerStateTone(state: PartnerState): 'success' | 'warning' | 'primary' | 'neutral' | 'error' {
  if (state === 'active') return 'success';
  if (state === 'ending_soon') return 'warning';
  if (state === 'scheduled') return 'primary';
  if (state === 'expired') return 'error';
  return 'neutral';
}

export function beneficiaryStateTone(state: BeneficiaryState): 'success' | 'warning' | 'primary' | 'neutral' | 'error' {
  if (state === 'active') return 'success';
  if (state === 'pending') return 'warning';
  if (state === 'scheduled') return 'primary';
  if (state === 'rejected') return 'error';
  return 'neutral';
}

export const PARTNER_KIND_ICON: Record<PartnerKind, string> = { company: 'business', school: 'school', organization: 'account_balance' };

/** The proofs a family may attach: a photo or a PDF, up to 5 MB (the bucket's own limits). */
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export function proofFileIssue(file: Pick<File, 'type' | 'size'> | null): 'proofType' | 'proofSize' | null {
  if (!file) return null;
  if (!(PROOF_TYPES as readonly string[]).includes(file.type)) return 'proofType';
  if (file.size > PROOF_MAX_BYTES) return 'proofSize';
  return null;
}
