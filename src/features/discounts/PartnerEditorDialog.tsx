import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { FormSection } from '@/components/admin/settings/FormSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTouchedFields } from '@/hooks/useTouchedFields';
import { errorCodeIn } from '@/lib/errorCode';
import { cn } from '@/lib/utils';

import { discountErrorKey } from './discountLook';
import {
  draftToPayload,
  emptyPartnerDraft,
  PARTNER_APPLIES,
  PARTNER_ERROR_CODES,
  PARTNER_ERROR_FIELD,
  PARTNER_KIND_ICON,
  PARTNER_KINDS,
  partnerFormIssues,
  partnerToDraft,
  type DiscountPartner,
  type PartnerDraft,
  type PartnerField,
} from './discounts';
import { useSavePartner } from './useDiscounts';

/**
 * Adding or changing a partner: who it is (and the other names families may write), the offer,
 * when it runs, the proof it needs, and the agreement's limits and contact. Every problem shows
 * under its field as it is typed; the server's own refusal lands under the same field.
 */
export function PartnerEditorDialog({
  nurseryId,
  today,
  partner,
  canChooseChain,
  onClose,
  onSaved,
}: {
  nurseryId: string;
  today: string;
  /** Editing this partner; a new one without it. */
  partner?: DiscountPartner | null;
  /** The signed-in admin manages the chain: the partner may cover every branch. */
  canChooseChain: boolean;
  onClose: () => void;
  onSaved?: (partnerId: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PartnerDraft>(() => (partner ? partnerToDraft(partner) : emptyPartnerDraft(today)));
  const fields = useTouchedFields<PartnerField>();
  const [serverField, setServerField] = useState<{ field: PartnerField; message: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSavePartner();
  const issues = partnerFormIssues(draft);

  const set = <K extends keyof PartnerDraft>(key: K, value: PartnerDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setServerField(null);
    setProblem(null);
  };
  const errorFor = (field: PartnerField) => {
    const issue = issues[field];
    if (issue && fields.isShown(field)) return t(`discounts.form.errors.${issue}`);
    return serverField?.field === field ? serverField.message : null;
  };

  const submit = async () => {
    fields.showAll();
    if (Object.keys(issues).length > 0 || save.isPending) return;
    try {
      const id = await save.mutateAsync({ nurseryId, partnerId: partner?.id ?? null, payload: draftToPayload(draft) });
      toast.success(partner ? t('discounts.form.updated') : t('discounts.form.created'));
      onSaved?.(id);
      onClose();
    } catch (error) {
      const code = errorCodeIn(error, PARTNER_ERROR_CODES);
      const field = code ? PARTNER_ERROR_FIELD[code] : undefined;
      if (field) setServerField({ field, message: t(discountErrorKey(error)) });
      else setProblem(t(discountErrorKey(error)));
    }
  };

  const toggleApplies = (scope: (typeof PARTNER_APPLIES)[number], on: boolean) =>
    set('appliesTo', on ? PARTNER_APPLIES.filter((s) => s === scope || draft.appliesTo.includes(s)) : draft.appliesTo.filter((s) => s !== scope));

  const nameError = errorFor('name');
  const valueError = errorFor('discountValue');
  const datesError = errorFor('dates');
  const appliesError = errorFor('appliesTo');
  const textsError = errorFor('texts');

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="partner-editor">
        <DialogHeader>
          <DialogTitle>{partner ? t('discounts.form.editTitle') : t('discounts.form.newTitle')}</DialogTitle>
          <DialogDescription>{t('discounts.form.description')}</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mt-2 max-h-[65vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title={t('discounts.form.sections.who')} icon="handshake">
              <ChoiceCards
                label={t('discounts.form.kind')}
                value={draft.kind}
                onChange={(kind) => set('kind', kind)}
                className="grid-cols-1 sm:grid-cols-3"
                options={PARTNER_KINDS.map((kind) => ({ value: kind, label: t(`discounts.kinds.${kind}`), icon: PARTNER_KIND_ICON[kind] }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="partner-name-en" label={t('discounts.form.nameEn')}>
                  <Input
                    id="partner-name-en"
                    value={draft.nameEn}
                    aria-invalid={Boolean(nameError)}
                    className={cn(nameError && invalidFieldClass)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => set('nameEn', e.target.value)}
                  />
                </FormField>
                <FormField id="partner-name-ar" label={t('discounts.form.nameAr')}>
                  <Input
                    id="partner-name-ar"
                    dir="rtl"
                    value={draft.nameAr}
                    aria-invalid={Boolean(nameError)}
                    className={cn(nameError && invalidFieldClass)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => set('nameAr', e.target.value)}
                  />
                </FormField>
              </div>
              <FieldError message={nameError} />
              <FormField id="partner-aliases" label={t('discounts.form.aliases')} optional hint={t('discounts.form.aliasesHint')} error={errorFor('aliases')}>
                <Input
                  id="partner-aliases"
                  value={draft.aliases}
                  placeholder={t('discounts.form.aliasesPlaceholder')}
                  aria-invalid={Boolean(errorFor('aliases'))}
                  className={cn(errorFor('aliases') && invalidFieldClass)}
                  onBlur={() => fields.touch('aliases')}
                  onChange={(e) => set('aliases', e.target.value)}
                />
              </FormField>
              {canChooseChain ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-on-surface">{t('discounts.form.scope')}</p>
                  <ChoiceCards
                    label={t('discounts.form.scope')}
                    value={draft.scope}
                    onChange={(scope) => set('scope', scope)}
                    options={[
                      { value: 'branch', label: t('discounts.scope.branch'), hint: t('discounts.scope.branchHint'), icon: 'store' },
                      { value: 'chain', label: t('discounts.scope.chain'), hint: t('discounts.scope.chainHint'), icon: 'hub' },
                    ]}
                  />
                </div>
              ) : null}
            </FormSection>

            <FormSection title={t('discounts.form.sections.offer')} icon="sell">
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-on-surface">{t('discounts.form.type')}</p>
                <ChoiceCards
                  label={t('discounts.form.type')}
                  value={draft.discountType}
                  onChange={(type) => set('discountType', type)}
                  options={[
                    { value: 'percentage', label: t('deals.types.percentage'), icon: 'percent' },
                    { value: 'fixed_amount', label: t('deals.types.fixed_amount'), icon: 'payments' },
                  ]}
                />
              </div>
              <FormField
                id="partner-value"
                label={draft.discountType === 'percentage' ? t('deals.fields.valuePercent') : t('deals.fields.valueAmount')}
                hint={draft.discountType === 'fixed_amount' ? t('discounts.form.amountHint') : undefined}
                error={valueError}
              >
                <Input
                  id="partner-value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={draft.discountType === 'percentage' ? 100 : undefined}
                  step={draft.discountType === 'percentage' ? 1 : 0.01}
                  value={draft.discountValue}
                  aria-invalid={Boolean(valueError)}
                  className={cn('sm:max-w-48', valueError && invalidFieldClass)}
                  onBlur={() => fields.touch('discountValue')}
                  onChange={(e) => set('discountValue', e.target.value)}
                />
              </FormField>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-on-surface">{t('discounts.form.appliesTo')}</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {PARTNER_APPLIES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-sm text-on-surface">
                      <Checkbox
                        checked={draft.appliesTo.includes(scope)}
                        onCheckedChange={(checked) => {
                          fields.touch('appliesTo');
                          toggleApplies(scope, checked === true);
                        }}
                      />
                      {t(`discounts.applies.${scope}`)}
                    </label>
                  ))}
                </div>
                <FieldError message={appliesError} />
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="partner-offer-en" label={t('discounts.form.offerEn')} optional>
                  <Textarea id="partner-offer-en" className="min-h-16" value={draft.offerDetailsEn} onChange={(e) => set('offerDetailsEn', e.target.value)} />
                </FormField>
                <FormField id="partner-offer-ar" label={t('discounts.form.offerAr')} optional>
                  <Textarea id="partner-offer-ar" dir="rtl" className="min-h-16" value={draft.offerDetailsAr} onChange={(e) => set('offerDetailsAr', e.target.value)} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title={t('discounts.form.sections.validity')} description={t('discounts.form.validityHint')} icon="event_available">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="partner-starts" label={t('discounts.form.startsOn')}>
                  <Input
                    id="partner-starts"
                    type="date"
                    value={draft.startsOn}
                    aria-invalid={Boolean(datesError)}
                    className={cn(datesError && invalidFieldClass)}
                    onBlur={() => fields.touch('dates')}
                    onChange={(e) => set('startsOn', e.target.value)}
                  />
                </FormField>
                <FormField id="partner-ends" label={t('discounts.form.endsOn')} optional hint={t('discounts.form.endsOnHint')}>
                  <Input
                    id="partner-ends"
                    type="date"
                    min={draft.startsOn || undefined}
                    value={draft.endsOn}
                    aria-invalid={Boolean(datesError)}
                    className={cn(datesError && invalidFieldClass)}
                    onBlur={() => fields.touch('dates')}
                    onChange={(e) => set('endsOn', e.target.value)}
                  />
                </FormField>
              </div>
              <FieldError message={datesError} />
              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm text-on-surface">
                <Checkbox checked={draft.active} onCheckedChange={(checked) => set('active', checked === true)} />
                {t('discounts.form.active')}
              </label>
            </FormSection>

            <FormSection title={t('discounts.form.sections.proof')} icon="badge">
              <ChoiceCards
                label={t('discounts.form.sections.proof')}
                value={draft.requiresProof ? 'yes' : 'no'}
                onChange={(value) => set('requiresProof', value === 'yes')}
                options={[
                  { value: 'yes', label: t('discounts.form.proofYes'), hint: t('discounts.form.proofYesHint'), icon: 'verified_user' },
                  { value: 'no', label: t('discounts.form.proofNo'), hint: t('discounts.form.proofNoHint'), icon: 'bolt' },
                ]}
              />
              {draft.requiresProof ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id="partner-proof-en" label={t('discounts.form.proofNoteEn')} optional hint={t('discounts.form.proofNoteHint')}>
                    <Input id="partner-proof-en" value={draft.proofNoteEn} onChange={(e) => set('proofNoteEn', e.target.value)} />
                  </FormField>
                  <FormField id="partner-proof-ar" label={t('discounts.form.proofNoteAr')} optional>
                    <Input id="partner-proof-ar" dir="rtl" value={draft.proofNoteAr} onChange={(e) => set('proofNoteAr', e.target.value)} />
                  </FormField>
                </div>
              ) : null}
            </FormSection>

            <FormSection title={t('discounts.form.sections.agreement')} icon="contract">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="partner-max" label={t('discounts.form.maxFamilies')} optional hint={t('discounts.form.maxFamiliesHint')} error={errorFor('maxFamilies')}>
                  <Input
                    id="partner-max"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={draft.maxFamilies}
                    aria-invalid={Boolean(errorFor('maxFamilies'))}
                    className={cn(errorFor('maxFamilies') && invalidFieldClass)}
                    onBlur={() => fields.touch('maxFamilies')}
                    onChange={(e) => set('maxFamilies', e.target.value)}
                  />
                </FormField>
                <FormField id="partner-ref" label={t('discounts.form.agreementRef')} optional>
                  <Input id="partner-ref" value={draft.agreementRef} onChange={(e) => set('agreementRef', e.target.value)} />
                </FormField>
                <FormField id="partner-contact" label={t('discounts.form.contactName')} optional>
                  <Input id="partner-contact" value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />
                </FormField>
                <FormField id="partner-phone" label={t('discounts.form.contactPhone')} optional>
                  <Input id="partner-phone" type="tel" dir="ltr" value={draft.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
                </FormField>
                <FormField id="partner-email" label={t('discounts.form.contactEmail')} optional error={errorFor('contactEmail')} className="sm:col-span-2">
                  <Input
                    id="partner-email"
                    type="email"
                    dir="ltr"
                    value={draft.contactEmail}
                    aria-invalid={Boolean(errorFor('contactEmail'))}
                    className={cn(errorFor('contactEmail') && invalidFieldClass)}
                    onBlur={() => fields.touch('contactEmail')}
                    onChange={(e) => set('contactEmail', e.target.value)}
                  />
                </FormField>
              </div>
            </FormSection>
            <FieldError message={textsError} />
          </div>

          <div className="mt-4 space-y-3">
            <FormProblem message={problem} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
