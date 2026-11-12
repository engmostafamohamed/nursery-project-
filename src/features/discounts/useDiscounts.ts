import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addBeneficiary,
  claimPartnerDiscount,
  decideClaim,
  endBeneficiary,
  fetchDiscountReport,
  fetchFamilyDiscounts,
  fetchPartnerDetail,
  fetchPartnerOffers,
  fetchPartnersPage,
  savePartner,
  searchDiscountFamilies,
  setPartnerActive,
} from './discountsApi';

export const discountKeys = {
  all: ['discounts'] as const,
  partners: (nurseryId: string | null | undefined) => ['discounts', 'partners', nurseryId ?? null] as const,
  partner: (nurseryId: string | null | undefined, partnerId: string | null | undefined) =>
    ['discounts', 'partner', nurseryId ?? null, partnerId ?? null] as const,
  offers: (nurseryId: string | null | undefined) => ['discounts', 'offers', nurseryId ?? null] as const,
  family: (nurseryId: string | null | undefined, parentId: string | null | undefined) =>
    ['discounts', 'family', nurseryId ?? null, parentId ?? 'me'] as const,
  families: (nurseryId: string | null | undefined, search: string) => ['discounts', 'families', nurseryId ?? null, search] as const,
  report: (nurseryId: string | null | undefined, from: string, to: string) => ['discounts', 'report', nurseryId ?? null, from, to] as const,
};

export const usePartnersPage = (nurseryId: string | null | undefined) =>
  useQuery({ queryKey: discountKeys.partners(nurseryId), queryFn: () => fetchPartnersPage(nurseryId as string), enabled: Boolean(nurseryId) });

export const usePartnerDetail = (nurseryId: string | null | undefined, partnerId: string | null | undefined) =>
  useQuery({
    queryKey: discountKeys.partner(nurseryId, partnerId),
    queryFn: () => fetchPartnerDetail(nurseryId as string, partnerId as string),
    enabled: Boolean(nurseryId && partnerId),
  });

export const usePartnerOffers = (nurseryId: string | null | undefined, enabled = true) =>
  useQuery({ queryKey: discountKeys.offers(nurseryId), queryFn: () => fetchPartnerOffers(nurseryId as string), enabled: enabled && Boolean(nurseryId) });

/** A family's discounts: the signed-in family's own without `parentId`. */
export const useFamilyDiscounts = (nurseryId: string | null | undefined, parentId?: string | null, enabled = true) =>
  useQuery({
    queryKey: discountKeys.family(nurseryId, parentId),
    queryFn: () => fetchFamilyDiscounts(nurseryId as string, parentId),
    enabled: enabled && Boolean(nurseryId),
  });

export const useDiscountFamilies = (nurseryId: string | null | undefined, search: string, enabled = true) =>
  useQuery({
    queryKey: discountKeys.families(nurseryId, search),
    queryFn: () => searchDiscountFamilies(nurseryId as string, search),
    enabled: enabled && Boolean(nurseryId),
  });

export const useDiscountReport = (nurseryId: string | null | undefined, from: string, to: string) =>
  useQuery({
    queryKey: discountKeys.report(nurseryId, from, to),
    queryFn: () => fetchDiscountReport(nurseryId as string, from, to),
    enabled: Boolean(nurseryId && from && to && from <= to),
  });

/**
 * A change to a discount: every discount view is read again, and so are the invoices and billing
 * (a family's unpaid application invoice follows a discount granted or ended) and the notifications.
 */
export function useDiscountChange<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const key of [
        discountKeys.all,
        ['admin-child-billing'],
        ['parent-invoices'],
        ['parent-billing'],
        ['application-package-invoice'],
        ['admin-invoices'],
        ['notifications'],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export const useSavePartner = () =>
  useDiscountChange((input: { nurseryId: string; partnerId: string | null; payload: Record<string, unknown> }) =>
    savePartner(input.nurseryId, input.partnerId, input.payload),
  );
export const useSetPartnerActive = () =>
  useDiscountChange((input: { nurseryId: string; partnerId: string; active: boolean }) => setPartnerActive(input.nurseryId, input.partnerId, input.active));
export const useDecideClaim = () =>
  useDiscountChange((input: { beneficiaryId: string; approve: boolean; note: string }) => decideClaim(input.beneficiaryId, input.approve, input.note));
export const useAddBeneficiary = () => useDiscountChange(addBeneficiary);
export const useEndBeneficiary = () =>
  useDiscountChange((input: { beneficiaryId: string; lastDay?: string | null }) => endBeneficiary(input.beneficiaryId, input.lastDay));
export const useClaimPartnerDiscount = () => useDiscountChange(claimPartnerDiscount);
