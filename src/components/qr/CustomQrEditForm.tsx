import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IdentityImageField } from '@/components/qr/IdentityImageField';
import {
  identityNumberErrorKey,
  identityNumberInputProps,
  isIdentityType,
  needsBackImage,
  normalizeIdentityNumberInput,
  type IdentityType,
} from '@/components/qr/pickupIdentity';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IssuedQrToken } from '@/hooks/useParentIssuedQrTokens';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';

export type CustomQrEditValues = {
  fullName: string;
  relationship: string;
  identityType: IdentityType;
  identityNumber: string;
  identityImagePath: string;
  /** Back of the card for a national ID, else null. */
  identityBackImagePath: string | null;
  notes: string;
  requireIdCapture: boolean;
  /** New last valid day (YYYY-MM-DD), or null to keep the current expiry. */
  validUntil: string | null;
};

type Props = {
  token: IssuedQrToken;
  relationshipOptions: FilterMenuOption[];
  identityOptions: FilterMenuOption<IdentityType>[];
  minDate: string;
  maxDate: string;
  isSaving: boolean;
  uploadIdentityImage: (file: File) => Promise<string>;
  onSave: (values: CustomQrEditValues) => Promise<void>;
  onCancel: () => void;
};

/** Edits the pickup person on an unused custom QR; the QR image itself stays the same. */
export function CustomQrEditForm({
  token,
  relationshipOptions,
  identityOptions,
  minDate,
  maxDate,
  isSaving,
  uploadIdentityImage,
  onSave,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const isActive = token.status === 'active';

  const [fullName, setFullName] = useState(token.pickupPersonFullName ?? token.delegateName ?? '');
  // Relationship is stored as the label shown when the QR was made; keep that text unless the parent picks another.
  const [relationship, setRelationship] = useState(
    relationshipOptions.find((option) => option.label === token.pickupRelationship)?.value ?? 'other',
  );
  const [relationshipChanged, setRelationshipChanged] = useState(false);
  const [identityType, setIdentityType] = useState<IdentityType>(
    isIdentityType(token.pickupIdentityType) ? token.pickupIdentityType : 'national_id',
  );
  const [identityNumber, setIdentityNumber] = useState(token.pickupIdentityNumber ?? '');
  const [identityNumberTouched, setIdentityNumberTouched] = useState(false);
  const [newFrontImage, setNewFrontImage] = useState<File | null>(null);
  const [newBackImage, setNewBackImage] = useState<File | null>(null);
  const [notes, setNotes] = useState(token.pickupNotes ?? '');
  const [requireIdCapture, setRequireIdCapture] = useState(token.requireIdCapture);
  const currentValidUntil = getNurseryCalendarDateString(new Date(token.expiresAt));
  const [validUntil, setValidUntil] = useState(
    currentValidUntil < minDate ? minDate : currentValidUntil > maxDate ? maxDate : currentValidUntil,
  );
  const [validUntilChanged, setValidUntilChanged] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isNationalId = needsBackImage(identityType);
  const hasFront = Boolean(newFrontImage || token.pickupIdentityImagePath);
  const hasBack = Boolean(newBackImage || token.pickupIdentityBackImagePath);
  const numberErrorKey = identityNumberErrorKey(identityType, identityNumber);

  const nameError = triedSave && !fullName.trim()
    ? t('qr.delegate.errors.nameRequired', { defaultValue: 'Full name is required.' })
    : undefined;
  const identityNumberError = numberErrorKey && (triedSave || identityNumberTouched) ? t(numberErrorKey) : undefined;
  const frontError = triedSave && !hasFront
    ? t(isNationalId ? 'qr.custom.errors.identityFrontImageRequired' : 'qr.custom.errors.identityImageRequired')
    : undefined;
  const backError = triedSave && isNationalId && !hasBack ? t('qr.custom.errors.identityBackImageRequired') : undefined;
  const busy = isSaving || isUploading;
  const keepImageHint = t('qr.custom.keepIdentityImageHint', { defaultValue: 'The current image is kept unless you upload a new one.' });

  const save = async () => {
    setTriedSave(true);
    if (!fullName.trim() || numberErrorKey || !hasFront || (isNationalId && !hasBack)) return;

    setIsUploading(Boolean(newFrontImage || newBackImage));
    try {
      const identityImagePath = newFrontImage ? await uploadIdentityImage(newFrontImage) : token.pickupIdentityImagePath ?? '';
      const identityBackImagePath = !isNationalId
        ? null
        : newBackImage
          ? await uploadIdentityImage(newBackImage)
          : token.pickupIdentityBackImagePath;
      setIsUploading(false);
      const relationshipLabel = relationshipOptions.find((option) => option.value === relationship)?.label ?? relationship;
      await onSave({
        fullName: fullName.trim(),
        relationship: relationshipChanged ? relationshipLabel : token.pickupRelationship ?? relationshipLabel,
        identityType,
        identityNumber: identityNumber.trim(),
        identityImagePath,
        identityBackImagePath,
        notes: notes.trim(),
        requireIdCapture,
        validUntil: isActive && validUntilChanged ? validUntil : null,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-on-surface">{t('qr.custom.editTitle', { defaultValue: 'Edit custom QR' })}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('qr.custom.fields.fullName', { defaultValue: 'Full name' })}</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} aria-invalid={Boolean(nameError)} />
          {nameError ? <p className="text-xs font-medium text-error">{nameError}</p> : null}
        </div>
        <FilterMenu
          value={relationship}
          options={relationshipOptions}
          onChange={(value) => {
            setRelationship(value);
            setRelationshipChanged(true);
          }}
          label={t('qr.custom.fields.relationship', { defaultValue: 'Relationship' })}
        />
        <FilterMenu
          value={identityType}
          options={identityOptions}
          onChange={(value) => {
            setIdentityType(value);
            setIdentityNumber((current) => normalizeIdentityNumberInput(value, current));
          }}
          label={t('qr.custom.fields.identityType', { defaultValue: 'ID type' })}
        />
        <div className="space-y-2">
          <Label>{t('qr.custom.fields.identityNumber', { defaultValue: 'ID / passport number' })}</Label>
          <Input
            {...identityNumberInputProps(identityType)}
            value={identityNumber}
            onChange={(e) => setIdentityNumber(normalizeIdentityNumberInput(identityType, e.target.value))}
            onBlur={() => setIdentityNumberTouched(true)}
            placeholder={isNationalId ? t('qr.custom.fields.nationalIdPlaceholder') : undefined}
            className={cn(identityNumberError && 'border-error ring-1 ring-error/30')}
            aria-invalid={Boolean(identityNumberError)}
          />
          {identityNumberError ? <p className="text-xs font-medium text-error">{identityNumberError}</p> : null}
        </div>
      </div>

      <div className={cn('grid gap-3', isNationalId && 'md:grid-cols-2')}>
        <IdentityImageField
          label={isNationalId
            ? t('qr.custom.fields.identityFront')
            : t('qr.custom.fields.identityImage', { defaultValue: 'ID / passport image' })}
          buttonLabel={isNationalId
            ? t('qr.custom.fields.uploadFront')
            : t('qr.custom.replaceIdentityImage', { defaultValue: 'Replace identity image' })}
          file={newFrontImage}
          onFile={setNewFrontImage}
          error={frontError}
          hint={token.pickupIdentityImagePath ? keepImageHint : undefined}
        />
        {isNationalId ? (
          <IdentityImageField
            label={t('qr.custom.fields.identityBack')}
            buttonLabel={t('qr.custom.fields.uploadBack')}
            file={newBackImage}
            onFile={setNewBackImage}
            error={backError}
            hint={token.pickupIdentityBackImagePath ? keepImageHint : undefined}
          />
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {isActive ? (
          <div className="space-y-2">
            <Label>{t('qr.delegate.fields.validOn')}</Label>
            <Input
              type="date"
              value={validUntil}
              min={minDate}
              max={maxDate}
              onChange={(e) => {
                setValidUntil(e.target.value || minDate);
                setValidUntilChanged(true);
              }}
            />
            <p className="text-xs text-on-surface-variant">{t('qr.delegate.fields.validOnHint')}</p>
          </div>
        ) : null}
        <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <Checkbox checked={requireIdCapture} onCheckedChange={(checked) => setRequireIdCapture(Boolean(checked))} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-on-surface">
              {t('qr.custom.fields.requireLiveCapture', { defaultValue: 'Require staff ID capture' })}
            </span>
            <span className="mt-1 block text-xs text-on-surface-variant">
              {t('qr.custom.fields.requireLiveCaptureHint', { defaultValue: 'Staff must capture a live ID photo before checkout.' })}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label>{t('qr.custom.fields.notes', { defaultValue: 'Notes for staff' })}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>save</span>
          {busy ? t('common.loading') : t('qr.custom.saveChanges', { defaultValue: 'Save changes' })}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
