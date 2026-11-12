import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { SearchInput } from '@/components/ui/FilterBar';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import { discountErrorKey, familyChildren, familyName, partnerName } from './discountLook';
import { grantablePartners, type DiscountPartner, type FamilyRef } from './discounts';
import { PartnerOfferCard } from './PartnerOfferCard';
import { useAddBeneficiary, useDiscountFamilies, usePartnersPage } from './useDiscounts';

function FamilyPicker({ nurseryId, value, onChange, invalid }: { nurseryId: string; value: FamilyRef | null; onChange: (family: FamilyRef) => void; invalid: boolean }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 250);
  const families = useDiscountFamilies(nurseryId, term);
  const rows = families.data ?? [];

  return (
    <div className="space-y-2">
      <SearchInput value={search} onChange={setSearch} placeholder={t('discounts.grant.searchFamily')} />
      <div
        role="radiogroup"
        aria-label={t('discounts.grant.family')}
        className={cn('max-h-64 divide-y divide-outline-variant overflow-y-auto rounded-xl border', invalid ? 'border-error' : 'border-outline-variant')}
      >
        {families.isLoading ? (
          <p className="px-3 py-4 text-sm text-on-surface-variant">{t('common.loading')}</p>
        ) : families.isError ? (
          <p className="px-3 py-4 text-sm text-error">{t(discountErrorKey(families.error))}</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-on-surface-variant">{t('discounts.grant.noFamilies')}</p>
        ) : (
          rows.map((family) => {
            const selected = value?.parentId === family.parentId;
            return (
              <button
                key={family.parentId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(family)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  selected ? 'bg-primary/5' : 'hover:bg-surface-container',
                )}
              >
                <MaterialSymbol name={selected ? 'radio_button_checked' : 'radio_button_unchecked'} className={selected ? 'text-primary' : 'text-on-surface-variant'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-on-surface">{familyName(family, isArabic)}</span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {[familyChildren(family, isArabic), family.phone].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * The nursery gives a family a partner's discount by hand (a family enrolled before the agreement,
 * a parent who changed jobs): from a partner's page (pick the family) or from a child's billing
 * (pick the partner). Active from the day chosen; the family is told.
 */
export function GrantDiscountDialog({
  nurseryId,
  today,
  partner,
  family,
  onClose,
}: {
  nurseryId: string;
  today: string;
  /** Fixed partner: the admin picks the family. */
  partner?: DiscountPartner;
  /** Fixed family: the admin picks the partner. */
  family?: FamilyRef;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [pickedFamily, setPickedFamily] = useState<FamilyRef | null>(family ?? null);
  const [pickedPartnerId, setPickedPartnerId] = useState<string | null>(partner?.id ?? null);
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const partners = usePartnersPage(partner ? null : nurseryId);
  const run = useAddBeneficiary();

  const choices = grantablePartners(partners.data?.partners ?? []);
  const chosenPartner = partner ?? choices.find((p) => p.id === pickedPartnerId) ?? null;
  const issues = {
    family: pickedFamily ? null : 'familyRequired',
    partner: chosenPartner ? null : 'partnerRequired',
    dates: !validFrom
      ? 'startRequired'
      : validTo && validTo < validFrom
        ? 'endBeforeStart'
        : chosenPartner?.endsOn && validFrom > chosenPartner.endsOn
          ? 'afterAgreementEnd'
          : null,
    note: note.trim().length > 300 ? 'tooLong' : null,
  };
  const shown = (key: keyof typeof issues) => (tried && issues[key] ? t(`discounts.form.errors.${issues[key]}`) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.values(issues).some(Boolean) || !pickedFamily || !chosenPartner || run.isPending) return;
    setProblem(null);
    try {
      await run.mutateAsync({ nurseryId, partnerId: chosenPartner.id, parentId: pickedFamily.parentId, validFrom, validTo: validTo || null, note });
      toast.success(t('discounts.grant.done', { family: familyName(pickedFamily, isArabic), partner: partnerName(chosenPartner, isArabic) }));
      onClose();
    } catch (error) {
      setProblem(t(discountErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="max-w-xl" data-testid="grant-discount-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {partner ? t('discounts.grant.titleForPartner', { partner: partnerName(partner, isArabic) }) : t('discounts.grant.titleForFamily')}
            </DialogTitle>
            <DialogDescription>{t('discounts.grant.body')}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pe-1">
            {family ? (
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm">
                <p className="font-semibold text-on-surface">{familyName(family, isArabic)}</p>
                <p className="text-xs text-on-surface-variant">{familyChildren(family, isArabic) || '—'}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-on-surface">{t('discounts.grant.family')}</p>
                <FamilyPicker nurseryId={nurseryId} value={pickedFamily} onChange={setPickedFamily} invalid={Boolean(shown('family'))} />
                <FieldError message={shown('family')} />
              </div>
            )}

            {partner ? null : (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-on-surface">{t('discounts.grant.partner')}</p>
                {partners.isLoading ? (
                  <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
                ) : choices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-outline-variant px-3 py-4 text-sm text-on-surface-variant">{t('discounts.grant.noPartners')}</p>
                ) : (
                  <div role="radiogroup" aria-label={t('discounts.grant.partner')} className="space-y-2">
                    {choices.map((p) => (
                      <PartnerOfferCard key={p.id} partner={p} selected={p.id === pickedPartnerId} onSelect={() => setPickedPartnerId(p.id)} />
                    ))}
                  </div>
                )}
                <FieldError message={shown('partner')} />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="grant-from" label={t('discounts.grant.from')} error={shown('dates')}>
                <Input
                  id="grant-from"
                  type="date"
                  value={validFrom}
                  aria-invalid={Boolean(shown('dates'))}
                  className={cn(shown('dates') && invalidFieldClass)}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </FormField>
              <FormField id="grant-to" label={t('discounts.grant.to')} optional hint={t('discounts.grant.toHint')}>
                <Input id="grant-to" type="date" min={validFrom || undefined} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
              </FormField>
            </div>
            <FormField id="grant-note" label={t('discounts.grant.note')} optional error={shown('note')}>
              <Textarea
                id="grant-note"
                className={cn('min-h-16 text-sm', shown('note') && invalidFieldClass)}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('discounts.grant.notePlaceholder')}
              />
            </FormField>
          </div>

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={run.isPending}>
              <MaterialSymbol name="add" size="text-base" />
              {run.isPending ? t('common.saving') : t('discounts.grant.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
