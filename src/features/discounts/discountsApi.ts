/*
 * Discounts over the network. Every read and write is a database function (a change shows at once);
 * a family's proof goes to the private partner-proofs bucket under <nursery>/<family>/.
 */
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import {
  toBeneficiary,
  toDiscountReport,
  toFamilies,
  toFamilyDiscounts,
  toOffers,
  toPartnerDetail,
  toPartnersPage,
  type DiscountPartner,
  type DiscountReport,
  type FamilyDiscounts,
  type FamilyRef,
  type PartnerBeneficiary,
  type PartnerDetail,
  type PartnersPage,
} from './discounts';

export const PROOF_BUCKET = 'partner-proofs';

export const fetchPartnersPage = async (nurseryId: string): Promise<PartnersPage> =>
  toPartnersPage(await callRpc('get_discount_partners', { p_nursery_id: nurseryId }));

export const fetchPartnerDetail = async (nurseryId: string, partnerId: string): Promise<PartnerDetail> =>
  toPartnerDetail(await callRpc('get_discount_partner', { p_nursery_id: nurseryId, p_partner_id: partnerId }));

export const fetchPartnerOffers = async (nurseryId: string): Promise<DiscountPartner[]> =>
  toOffers(await callRpc('get_partner_offers', { p_nursery_id: nurseryId }));

/** A family's discounts: the signed-in family's own without `parentId`, any family's for the nursery's staff. */
export const fetchFamilyDiscounts = async (nurseryId: string, parentId?: string | null): Promise<FamilyDiscounts> =>
  toFamilyDiscounts(await callRpc('get_family_discounts', { p_nursery_id: nurseryId, p_parent_id: parentId ?? null }));

export const searchDiscountFamilies = async (nurseryId: string, search: string): Promise<FamilyRef[]> =>
  toFamilies(await callRpc('search_discount_families', { p_nursery_id: nurseryId, p_search: search }));

export const fetchDiscountReport = async (nurseryId: string, from: string, to: string): Promise<DiscountReport> =>
  toDiscountReport(await callRpc('get_discount_report', { p_nursery_id: nurseryId, p_from: from, p_to: to }));

export const savePartner = async (nurseryId: string, partnerId: string | null, payload: Record<string, unknown>): Promise<string> =>
  String(await callRpc('save_discount_partner', { p_nursery_id: nurseryId, p_id: partnerId, p: payload }));

export const setPartnerActive = async (nurseryId: string, partnerId: string, active: boolean): Promise<void> => {
  await callRpc('set_discount_partner_active', { p_nursery_id: nurseryId, p_partner_id: partnerId, p_active: active });
};

export const decideClaim = async (beneficiaryId: string, approve: boolean, note: string): Promise<PartnerBeneficiary> =>
  toBeneficiary(await callRpc('decide_partner_claim', { p_beneficiary_id: beneficiaryId, p_approve: approve, p_note: note.trim() || null }));

export const addBeneficiary = async (input: {
  nurseryId: string;
  partnerId: string;
  parentId: string;
  validFrom?: string | null;
  validTo?: string | null;
  note?: string;
}): Promise<PartnerBeneficiary> =>
  toBeneficiary(await callRpc('add_partner_beneficiary', {
    p_nursery_id: input.nurseryId,
    p_partner_id: input.partnerId,
    p_parent_id: input.parentId,
    p_valid_from: input.validFrom || null,
    p_valid_to: input.validTo || null,
    p_note: input.note?.trim() || null,
  }));

/** Ends a family's discount after `lastDay` (yesterday when not given): new invoices go without it. */
export const endBeneficiary = async (beneficiaryId: string, lastDay?: string | null): Promise<PartnerBeneficiary> =>
  toBeneficiary(await callRpc('end_partner_beneficiary', { p_beneficiary_id: beneficiaryId, p_last_day: lastDay || null }));

function extension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] || 'bin';
}

/** The signed-in family asks for a partner's discount, with its proof when the partner needs one. */
export async function claimPartnerDiscount(input: { nurseryId: string; parentId: string; partnerId: string; proof: File | null }): Promise<PartnerBeneficiary> {
  let proofPath: string | null = null;
  if (input.proof) {
    proofPath = `${input.nurseryId}/${input.parentId}/${crypto.randomUUID()}.${extension(input.proof)}`;
    const { error } = await supabase.storage.from(PROOF_BUCKET).upload(proofPath, input.proof, { contentType: input.proof.type, upsert: false });
    if (error) throw error;
  }
  return toBeneficiary(await callRpc('claim_partner_discount', {
    p_nursery_id: input.nurseryId,
    p_partner_id: input.partnerId,
    p_proof_path: proofPath,
    p_proof_name: input.proof?.name.slice(0, 120) ?? null,
  }));
}
