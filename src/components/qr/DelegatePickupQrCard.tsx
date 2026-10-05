import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CustomQrEditForm, type CustomQrEditValues } from '@/components/qr/CustomQrEditForm';
import { IdentityImageField } from '@/components/qr/IdentityImageField';
import {
  identityNumberErrorKey,
  identityNumberInputProps,
  isIdentityType,
  needsBackImage,
  normalizeIdentityNumberInput,
  type IdentityType,
} from '@/components/qr/pickupIdentity';
import { QrExpiryDatePrompt } from '@/components/qr/QrExpiryDatePrompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentIssuedQrTokens, type IssuedQrToken } from '@/hooks/useParentIssuedQrTokens';
import { useQrTokenGeneration, type QrTokenPayload } from '@/hooks/useQrTokenGeneration';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Props = {
  childId: string;
  nurseryId: string;
  childDisplayName: string;
};

const MAX_DAYS_AHEAD = 7;
const MAX_ACTIVE_CUSTOM_QRS = 3;

type RelationshipType = 'driver' | 'grandparent' | 'aunt_uncle' | 'family_friend' | 'nanny' | 'other';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function printableQrValue(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/qr/verify?token=${encodeURIComponent(token)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusMeta(status: IssuedQrToken['status']) {
  if (status === 'active') {
    return { label: 'Active', variant: 'success' as const, icon: 'verified' };
  }
  if (status === 'used') {
    return { label: 'Used', variant: 'secondary' as const, icon: 'task_alt' };
  }
  if (status === 'expired') {
    return { label: 'Inactive', variant: 'warning' as const, icon: 'schedule' };
  }
  return { label: 'Inactive', variant: 'error' as const, icon: 'block' };
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'custom-qr';
}

function qrCanvasId(id: string): string {
  return `custom-pickup-qr-canvas-${safeFilePart(id)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Whether a saved QR's data still meets today's rules (e.g. a 14-digit national ID with both card
 * sides), so a new QR can be issued from it.
 */
function canRegenerateFrom(token: IssuedQrToken): boolean {
  if (!token.pickupPersonFullName || !isIdentityType(token.pickupIdentityType) || !token.pickupIdentityImagePath) {
    return false;
  }
  if (identityNumberErrorKey(token.pickupIdentityType, token.pickupIdentityNumber ?? '')) return false;
  return !needsBackImage(token.pickupIdentityType) || Boolean(token.pickupIdentityBackImagePath);
}

export function DelegatePickupQrCard({ childId, nurseryId, childDisplayName }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const generate = useQrTokenGeneration();
  const {
    tokens,
    isLoading,
    revoke,
    isRevoking,
    updateStatus,
    isUpdatingStatus,
    rotateToken,
    isRotating,
    editToken,
    isEditing,
  } = useParentIssuedQrTokens(user?.id);

  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('driver');
  const [identityType, setIdentityType] = useState<IdentityType>('national_id');
  const [identityNumber, setIdentityNumber] = useState('');
  const [identityNumberTouched, setIdentityNumberTouched] = useState(false);
  // Front of a national ID card, or the single passport / other ID image.
  const [identityImage, setIdentityImage] = useState<File | null>(null);
  const [identityBackImage, setIdentityBackImage] = useState<File | null>(null);
  const [triedGenerate, setTriedGenerate] = useState(false);
  const [notes, setNotes] = useState('');
  const [requireIdCapture, setRequireIdCapture] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [latestGenerated, setLatestGenerated] = useState<QrTokenPayload | null>(null);
  const [latestStatus, setLatestStatus] = useState<IssuedQrToken['status']>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Reissuing or reactivating a QR first asks for the day it should stay valid until.
  const [datePrompt, setDatePrompt] = useState<{ token: IssuedQrToken; action: 'regenerate' | 'activate' } | null>(null);

  const today = useMemo(() => getNurseryCalendarDateString(), []);
  const maxDate = useMemo(() => addCalendarDaysYmd(today, MAX_DAYS_AHEAD), [today]);
  const [date, setDate] = useState<string>(today);

  const identityOptions = useMemo<FilterMenuOption<IdentityType>[]>(() => [
    { value: 'national_id', label: t('qr.custom.identityTypes.nationalId', { defaultValue: 'National ID' }), icon: 'badge' },
    { value: 'passport', label: t('qr.custom.identityTypes.passport', { defaultValue: 'Passport' }), icon: 'book' },
    { value: 'other', label: t('qr.custom.identityTypes.other', { defaultValue: 'Other ID' }), icon: 'assignment_ind' },
  ], [t]);

  const relationshipOptions = useMemo<FilterMenuOption<RelationshipType>[]>(() => [
    { value: 'driver', label: t('qr.custom.relationships.driver', { defaultValue: 'Driver' }), icon: 'local_taxi' },
    { value: 'grandparent', label: t('qr.custom.relationships.grandparent', { defaultValue: 'Grandparent' }), icon: 'family_restroom' },
    { value: 'aunt_uncle', label: t('qr.custom.relationships.auntUncle', { defaultValue: 'Aunt / Uncle' }), icon: 'diversity_3' },
    { value: 'family_friend', label: t('qr.custom.relationships.familyFriend', { defaultValue: 'Family friend' }), icon: 'group' },
    { value: 'nanny', label: t('qr.custom.relationships.nanny', { defaultValue: 'Nanny' }), icon: 'child_care' },
    { value: 'other', label: t('qr.custom.relationships.other', { defaultValue: 'Other' }), icon: 'person' },
  ], [t]);

  const relationshipLabel = relationshipOptions.find((option) => option.value === relationship)?.label ?? relationship;

  const customTokens = useMemo(
    () => tokens.filter((token) => token.childId === childId && token.purpose === 'delegate'),
    [childId, tokens],
  );
  const activeCustomTokens = customTokens.filter((token) => token.status === 'active');
  const latestSavedToken = latestGenerated
    ? customTokens.find((token) => token.token === latestGenerated.token || (latestGenerated.id && token.id === latestGenerated.id))
    : undefined;
  const latestCountsAsActive = Boolean(latestGenerated && latestStatus === 'active' && !latestSavedToken);
  const activeCount = activeCustomTokens.length + (latestCountsAsActive ? 1 : 0);
  const canCreate = activeCount < MAX_ACTIVE_CUSTOM_QRS;
  const isBusy = generate.isPending || isUploading || isRevoking || isUpdatingStatus || isRotating || isEditing;
  const latestIdentityLabel = latestGenerated
    ? identityOptions.find((option) => option.value === latestGenerated.pickup_identity_type)?.label ?? latestGenerated.pickup_identity_type
    : '';
  const latestRelationshipLabel = latestGenerated?.pickup_relationship || '';

  const isNationalId = needsBackImage(identityType);
  const identityNumberError = identityNumberErrorKey(identityType, identityNumber);
  const formErrors = {
    fullName: !fullName.trim() ? t('qr.delegate.errors.nameRequired', { defaultValue: 'Full name is required.' }) : undefined,
    identityNumber: identityNumberError ? t(identityNumberError) : undefined,
    identityImage: !identityImage
      ? t(isNationalId ? 'qr.custom.errors.identityFrontImageRequired' : 'qr.custom.errors.identityImageRequired')
      : undefined,
    identityBackImage: isNationalId && !identityBackImage ? t('qr.custom.errors.identityBackImageRequired') : undefined,
  };
  // Required-field errors appear after a Generate attempt; a malformed ID number as soon as the field is left.
  const shownErrors = {
    fullName: triedGenerate ? formErrors.fullName : undefined,
    identityNumber: triedGenerate || identityNumberTouched ? formErrors.identityNumber : undefined,
    identityImage: triedGenerate ? formErrors.identityImage : undefined,
    identityBackImage: triedGenerate ? formErrors.identityBackImage : undefined,
  };

  const resetForm = () => {
    setFullName('');
    setRelationship('driver');
    setIdentityType('national_id');
    setIdentityNumber('');
    setIdentityNumberTouched(false);
    setIdentityImage(null);
    setIdentityBackImage(null);
    setTriedGenerate(false);
    setNotes('');
    setRequireIdCapture(true);
    setDate(today);
  };

  /** A saved custom QR as an IssuedQrToken, for actions on the QR shown right after generating it. */
  const latestAsIssuedToken = (): IssuedQrToken | null => {
    if (!latestGenerated) return null;
    if (latestSavedToken) return latestSavedToken;
    if (!latestGenerated.id) return null;
    return {
      id: latestGenerated.id,
      token: latestGenerated.token,
      childId,
      purpose: 'delegate',
      delegateName: latestGenerated.delegate_name,
      pickupPersonFullName: latestGenerated.pickup_person_full_name,
      pickupRelationship: latestGenerated.pickup_relationship,
      pickupIdentityType: latestGenerated.pickup_identity_type,
      pickupIdentityNumber: latestGenerated.pickup_identity_number,
      pickupIdentityImagePath: latestGenerated.pickup_identity_image_path,
      pickupIdentityBackImagePath: latestGenerated.pickup_identity_back_image_path,
      pickupNotes: latestGenerated.pickup_notes,
      requireIdCapture: latestGenerated.require_id_capture,
      singleUse: latestGenerated.single_use,
      createdAt: new Date().toISOString(),
      expiresAt: latestGenerated.expires_at,
      consumedAt: null,
      status: latestStatus,
    };
  };

  const uploadIdentityImage = async (file: File) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${nurseryId}/qr-pickup-identities/${childId}/${Date.now()}-${randomSuffix()}.${ext}`;
    const { error } = await supabase.storage.from('application-documents').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    return `application-documents:${path}`;
  };

  const getQrCanvas = (id: string) => {
    const canvas = document.getElementById(qrCanvasId(id));
    return canvas instanceof HTMLCanvasElement ? canvas : null;
  };

  const downloadQrImage = (id: string, name: string) => {
    const canvas = getQrCanvas(id);
    if (!canvas) {
      toast.error(t('qr.custom.exportMissing', { defaultValue: 'QR image is not ready yet.' }));
      return;
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `xo-custom-qr-${safeFilePart(name)}.png`;
    a.click();
  };

  const downloadQrPdf = (id: string, name: string, expiresAt: string) => {
    const canvas = getQrCanvas(id);
    if (!canvas) {
      toast.error(t('qr.custom.exportMissing', { defaultValue: 'QR image is not ready yet.' }));
      return;
    }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const image = canvas.toDataURL('image/png');
    doc.setFontSize(18);
    doc.text('XO Nursery - Custom pickup QR', pageWidth / 2, 72, { align: 'center' });
    doc.setFontSize(12);
    doc.text(name, pageWidth / 2, 100, { align: 'center' });
    doc.text(childDisplayName, pageWidth / 2, 120, { align: 'center' });
    doc.addImage(image, 'PNG', (pageWidth - 260) / 2, 150, 260, 260);
    doc.setFontSize(10);
    doc.text(`${t('qr.delegate.expiresLabel')}: ${formatDateTime(expiresAt)}`, pageWidth / 2, 440, { align: 'center' });
    doc.save(`xo-custom-qr-${safeFilePart(name)}.pdf`);
  };

  const printQr = (id: string, name: string, expiresAt: string) => {
    const canvas = getQrCanvas(id);
    if (!canvas) {
      toast.error(t('qr.custom.exportMissing', { defaultValue: 'QR image is not ready yet.' }));
      return;
    }
    const popup = window.open('', '_blank', 'width=720,height=860');
    if (!popup) {
      toast.error(t('qr.custom.printBlocked', { defaultValue: 'Allow popups to print this QR.' }));
      return;
    }
    const image = canvas.toDataURL('image/png');
    const safeName = escapeHtml(name);
    const safeChildName = escapeHtml(childDisplayName);
    const safeExpiresLabel = escapeHtml(t('qr.delegate.expiresLabel'));
    const safeExpiresAt = escapeHtml(formatDateTime(expiresAt));
    const safeNotice = escapeHtml(t('qr.delegate.singleUseNotice'));
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>XO Nursery - Custom pickup QR</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; text-align: center; color: #111827; }
            img { width: 280px; height: 280px; margin: 24px auto; display: block; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            p { margin: 6px 0; color: #4b5563; }
            .notice { color: #dc2626; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>XO Nursery - Custom pickup QR</h1>
          <p>${safeName}</p>
          <p>${safeChildName}</p>
          <img src="${image}" alt="QR code" />
          <p>${safeExpiresLabel}: ${safeExpiresAt}</p>
          <p class="notice">${safeNotice}</p>
          <script>window.onload = () => { window.print(); window.close(); };</script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  /** Seconds from now until the end of `ymd` (local), or null for an invalid date. */
  const ttlForDate = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map((s) => Number(s));
    if (!y || !m || !d) return null;
    const endOfDayLocal = new Date(y, m - 1, d, 23, 59, 0, 0);
    return Math.max(60, Math.floor((endOfDayLocal.getTime() - Date.now()) / 1000));
  };

  const createCustomQr = async (args: {
    name: string;
    relationshipText: string;
    identityTypeValue: IdentityType;
    identityNumberValue: string;
    identityImagePath: string;
    identityBackImagePath: string | null;
    notesValue?: string | null;
    requireCapture: boolean;
    successName: string;
    validUntil: string;
  }) => {
    if (!canCreate) {
      toast.error(t('qr.custom.errors.limitReached', {
        defaultValue: 'You can keep only 3 active custom QRs. Delete one to create another.',
      }));
      return;
    }

    const ttl = ttlForDate(args.validUntil);
    if (!ttl) {
      toast.error(t('qr.delegate.errors.dateRequired'));
      return;
    }

    const result = await generate.mutateAsync({
      child_id: childId,
      nursery_id: nurseryId,
      purpose: 'delegate',
      delegate_name: args.name,
      pickup_person_full_name: args.name,
      pickup_relationship: args.relationshipText,
      pickup_identity_type: args.identityTypeValue,
      pickup_identity_number: args.identityNumberValue,
      pickup_identity_image_path: args.identityImagePath,
      pickup_identity_back_image_path: args.identityBackImagePath ?? undefined,
      pickup_notes: args.notesValue || undefined,
      require_id_capture: args.requireCapture,
      single_use: true,
      ttl_seconds: ttl,
    });
    setLatestGenerated(result);
    setLatestStatus('active');
    toast.success(t('qr.delegate.successToast', { name: args.successName }));
  };

  const onGenerate = async () => {
    setTriedGenerate(true);
    if (Object.values(formErrors).some(Boolean) || !identityImage) return;
    const name = fullName.trim();

    try {
      setIsUploading(true);
      const identityImagePath = await uploadIdentityImage(identityImage);
      const identityBackImagePath = isNationalId && identityBackImage ? await uploadIdentityImage(identityBackImage) : null;
      await createCustomQr({
        name,
        relationshipText: relationshipLabel,
        identityTypeValue: identityType,
        identityNumberValue: identityNumber.trim(),
        identityImagePath,
        identityBackImagePath,
        notesValue: notes.trim() || null,
        requireCapture: requireIdCapture,
        successName: name,
        validUntil: date,
      });
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.delegate.errors.failed'), { description: msg });
    } finally {
      setIsUploading(false);
    }
  };

  /** Issues a new QR with the same pickup person and a new expiry day. */
  const onRegenerate = async (token: IssuedQrToken, validUntil: string) => {
    if (
      !canRegenerateFrom(token) ||
      !token.pickupPersonFullName ||
      !isIdentityType(token.pickupIdentityType) ||
      !token.pickupIdentityNumber ||
      !token.pickupIdentityImagePath
    ) {
      toast.error(t('qr.custom.errors.missingSavedData', {
        defaultValue: 'This QR is missing saved identity data, so it cannot be generated again.',
      }));
      return;
    }

    try {
      setRegeneratingId(token.id);
      await createCustomQr({
        name: token.pickupPersonFullName,
        relationshipText: token.pickupRelationship ?? '',
        identityTypeValue: token.pickupIdentityType,
        identityNumberValue: token.pickupIdentityNumber,
        identityImagePath: token.pickupIdentityImagePath,
        identityBackImagePath: needsBackImage(token.pickupIdentityType) ? token.pickupIdentityBackImagePath : null,
        notesValue: token.pickupNotes,
        requireCapture: token.requireIdCapture,
        successName: token.pickupPersonFullName,
        validUntil,
      });
      setDatePrompt(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.delegate.errors.failed'), { description: msg });
    } finally {
      setRegeneratingId(null);
    }
  };

  const onDelete = async (token: IssuedQrToken) => {
    try {
      setDeletingId(token.id);
      await revoke({ tokenId: token.id, childId: token.childId, nurseryId });
      toast.success(t('qr.custom.deleteSuccess', { defaultValue: 'Custom QR deleted.' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.custom.deleteFailed', { defaultValue: 'Could not delete QR.' }), { description: msg });
    } finally {
      setDeletingId(null);
    }
  };

  /** `validUntil` (YYYY-MM-DD) is the new last valid day when activating. */
  const onUpdateStatus = async (token: IssuedQrToken, status: 'active' | 'inactive', validUntil?: string) => {
    try {
      setStatusUpdatingId(token.id);
      const ttl = status === 'active' && validUntil ? ttlForDate(validUntil) : undefined;
      const result = await updateStatus({
        tokenId: token.id,
        childId: token.childId,
        nurseryId,
        status,
        ttlSeconds: ttl ?? undefined,
      });
      if (latestGenerated && (latestGenerated.id === token.id || latestGenerated.token === token.token)) {
        setLatestStatus(status === 'active' ? 'active' : 'expired');
        if (result.expires_at) {
          setLatestGenerated((prev) => prev ? { ...prev, expires_at: result.expires_at ?? prev.expires_at } : prev);
        }
      }
      setDatePrompt(null);
      toast.success(status === 'active'
        ? t('qr.custom.statusActiveSuccess', { defaultValue: 'QR status changed to active.' })
        : t('qr.custom.statusInactiveSuccess', { defaultValue: 'QR status changed to inactive.' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.custom.statusFailed', { defaultValue: 'Could not update QR status.' }), { description: msg });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const onEdit = async (token: IssuedQrToken, values: CustomQrEditValues) => {
    try {
      const result = await editToken({
        tokenId: token.id,
        childId: token.childId,
        nurseryId,
        pickupPersonFullName: values.fullName,
        pickupRelationship: values.relationship,
        pickupIdentityType: values.identityType,
        pickupIdentityNumber: values.identityNumber,
        pickupIdentityImagePath: values.identityImagePath,
        pickupIdentityBackImagePath: values.identityBackImagePath,
        pickupNotes: values.notes,
        requireIdCapture: values.requireIdCapture,
        ttlSeconds: values.validUntil ? ttlForDate(values.validUntil) ?? undefined : undefined,
      });
      if (latestGenerated && (latestGenerated.id === token.id || latestGenerated.token === token.token)) {
        setLatestGenerated((prev) => prev ? {
          ...prev,
          delegate_name: values.fullName,
          pickup_person_full_name: values.fullName,
          pickup_relationship: values.relationship,
          pickup_identity_type: values.identityType,
          pickup_identity_number: values.identityNumber,
          pickup_identity_image_path: values.identityImagePath,
          pickup_identity_back_image_path: values.identityBackImagePath,
          pickup_notes: values.notes || null,
          require_id_capture: values.requireIdCapture,
          expires_at: result.expires_at ?? prev.expires_at,
        } : prev);
      }
      setEditingId(null);
      toast.success(t('qr.custom.editSuccess', { defaultValue: 'Custom QR updated.' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.custom.editFailed', { defaultValue: 'Could not update QR.' }), { description: msg });
    }
  };

  const confirmDatePrompt = (validUntil: string) => {
    if (!datePrompt) return;
    if (datePrompt.action === 'regenerate') void onRegenerate(datePrompt.token, validUntil);
    else void onUpdateStatus(datePrompt.token, 'active', validUntil);
  };

  const renderDatePrompt = (tokenId: string | null | undefined) => {
    if (!datePrompt || !tokenId || datePrompt.token.id !== tokenId) return null;
    const regenerate = datePrompt.action === 'regenerate';
    return (
      <QrExpiryDatePrompt
        title={regenerate
          ? t('qr.custom.regenerateTitle', { defaultValue: 'New QR with the same data: choose the expiry date' })
          : t('qr.custom.activateTitle', { defaultValue: 'Activate QR: choose the expiry date' })}
        confirmLabel={regenerate
          ? t('qr.custom.generateSameData', { defaultValue: 'Generate same data' })
          : t('qr.custom.setActive', { defaultValue: 'Set active' })}
        minDate={today}
        maxDate={maxDate}
        isBusy={isBusy || regeneratingId === tokenId || statusUpdatingId === tokenId}
        onConfirm={confirmDatePrompt}
        onCancel={() => setDatePrompt(null)}
      />
    );
  };

  const onRotate = async (token: IssuedQrToken) => {
    try {
      setRotatingId(token.id);
      const result = await rotateToken({ tokenId: token.id, childId: token.childId, nurseryId });
      if (latestGenerated && (latestGenerated.id === token.id || latestGenerated.token === token.token)) {
        setLatestGenerated((prev) => prev ? {
          ...prev,
          token: result.token ?? prev.token,
          expires_at: result.expires_at ?? prev.expires_at,
        } : prev);
      }
      toast.success(t('qr.rotated', { defaultValue: 'QR code rotated.' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.errors.rotateFailed', { defaultValue: 'Could not rotate QR.' }), { description: msg });
    } finally {
      setRotatingId(null);
    }
  };

  const onUpdateLatestStatus = async (status: 'active' | 'inactive') => {
    if (!latestGenerated) return;
    const tokenForAction = latestAsIssuedToken();
    if (!tokenForAction) {
      toast.error(t('qr.custom.errors.missingTokenId', { defaultValue: 'Refresh the page before changing this QR status.' }));
      return;
    }
    if (status === 'active') {
      setDatePrompt({ token: tokenForAction, action: 'activate' });
      return;
    }
    await onUpdateStatus(tokenForAction, status);
  };

  const onRotateLatest = async () => {
    if (!latestGenerated) return;
    const tokenForAction = latestAsIssuedToken();
    if (!tokenForAction) {
      toast.error(t('qr.custom.errors.missingTokenId', { defaultValue: 'Refresh the page before rotating this QR.' }));
      return;
    }
    await onRotate(tokenForAction);
  };

  const onDeleteLatest = async () => {
    if (!latestGenerated) return;
    const tokenForAction = latestAsIssuedToken();
    if (!tokenForAction) {
      setLatestGenerated(null);
      toast.error(t('qr.custom.errors.missingTokenId', { defaultValue: 'Refresh the page before deleting this QR.' }));
      return;
    }
    await onDelete(tokenForAction);
    setLatestGenerated(null);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-on-surface">
            {t('qr.custom.title', { defaultValue: 'Create custom pickup QR' })}
          </h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('qr.custom.subtitle', {
              name: childDisplayName,
              defaultValue: 'Create a temporary QR for a specific person picking up {{name}}.',
            })}
          </p>
        </div>
        <Badge variant={canCreate ? 'default' : 'warning'} className="w-fit">
          {activeCount}/{MAX_ACTIVE_CUSTOM_QRS} {t('qr.custom.activeLimitLabel', { defaultValue: 'active' })}
        </Badge>
      </div>

      {latestGenerated ? (
        <div className="grid gap-4 rounded-2xl border border-success/30 bg-success/5 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-xl bg-white p-4">
            {latestStatus === 'active' ? (
              <QRCodeSVG value={printableQrValue(latestGenerated.token)} size={148} />
            ) : (
              <div className="flex h-[148px] w-[148px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface text-on-surface-variant">
                <span className="material-symbols-outlined text-3xl" aria-hidden>qr_code_2</span>
                <span className="text-xs font-semibold">{statusMeta(latestStatus).label}</span>
              </div>
            )}
            <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
              <QRCodeCanvas
                id={qrCanvasId(latestGenerated.id ?? latestGenerated.token)}
                value={printableQrValue(latestGenerated.token)}
                size={512}
                marginSize={2}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-3">
            <div className="space-y-1">
              <Badge variant={statusMeta(latestStatus).variant} className="gap-1">
                <span className="material-symbols-outlined text-sm" aria-hidden>{statusMeta(latestStatus).icon}</span>
                {latestStatus === 'active'
                  ? t('qr.custom.latestReady', { defaultValue: 'QR ready' })
                  : statusMeta(latestStatus).label}
              </Badge>
              <h4 className="truncate text-base font-semibold text-on-surface">
                {latestGenerated.pickup_person_full_name ?? latestGenerated.delegate_name ?? t('qr.custom.unknownPerson', { defaultValue: 'Pickup person' })}
              </h4>
              <p className="text-sm text-on-surface-variant">{childDisplayName}</p>
              <p className="text-xs text-on-surface-variant">
                {latestRelationshipLabel || '-'} - {latestIdentityLabel || '-'}: {latestGenerated.pickup_identity_number ?? '-'}
              </p>
              <p className="text-xs text-on-surface-variant">
                {t('qr.delegate.expiresLabel')}: {formatDateTime(latestGenerated.expires_at)}
              </p>
            </div>
            <p className="text-xs font-medium text-error">
              {t('qr.delegate.singleUseNotice')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetForm} disabled={!canCreate}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
                {t('qr.custom.newQr', { defaultValue: 'New QR' })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onRotateLatest()}
                disabled={isBusy || latestStatus === 'used' || rotatingId === (latestSavedToken?.id ?? latestGenerated.id)}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
                {rotatingId === (latestSavedToken?.id ?? latestGenerated.id)
                  ? t('common.loading')
                  : t('qr.rotate', { defaultValue: 'Rotate' })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onUpdateLatestStatus(latestStatus === 'active' ? 'inactive' : 'active')}
                disabled={isBusy || statusUpdatingId === (latestSavedToken?.id ?? latestGenerated.id)}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                  {latestStatus === 'active' ? 'toggle_off' : 'toggle_on'}
                </span>
                {latestStatus === 'active'
                  ? t('qr.custom.setInactive', { defaultValue: 'Set inactive' })
                  : t('qr.custom.setActive', { defaultValue: 'Set active' })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadQrImage(
                  latestGenerated.id ?? latestGenerated.token,
                  latestGenerated.pickup_person_full_name ?? latestGenerated.delegate_name ?? 'custom-qr',
                )}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>image</span>
                {t('qr.custom.downloadImage', { defaultValue: 'Image' })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadQrPdf(
                  latestGenerated.id ?? latestGenerated.token,
                  latestGenerated.pickup_person_full_name ?? latestGenerated.delegate_name ?? 'custom-qr',
                  latestGenerated.expires_at,
                )}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>picture_as_pdf</span>
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => printQr(
                  latestGenerated.id ?? latestGenerated.token,
                  latestGenerated.pickup_person_full_name ?? latestGenerated.delegate_name ?? 'custom-qr',
                  latestGenerated.expires_at,
                )}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>print</span>
                {t('qr.print', { defaultValue: 'Print QR' })}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => void onDeleteLatest()} disabled={isBusy}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>delete</span>
                {t('common.delete')}
              </Button>
            </div>
            {renderDatePrompt(latestSavedToken?.id ?? latestGenerated.id)}
          </div>
        </div>
      ) : null}

      {!canCreate ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-on-surface">
          <span className="material-symbols-outlined text-base text-warning" aria-hidden>info</span>
          <span>
            {t('qr.custom.limitReached', {
              defaultValue: 'You already have 3 active custom QR codes for this child. Delete one before creating another.',
            })}
          </span>
        </div>
      ) : null}

      {canCreate ? (
      <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('qr.custom.fields.fullName', { defaultValue: 'Full name' })}</Label>
            <Input
              placeholder={t('qr.custom.fields.fullNamePlaceholder', { defaultValue: 'Name exactly as shown on ID' })}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              disabled={!canCreate}
              className={cn(shownErrors.fullName && 'border-error ring-1 ring-error/30')}
              aria-invalid={Boolean(shownErrors.fullName)}
            />
            {shownErrors.fullName ? <p className="text-xs font-medium text-error">{shownErrors.fullName}</p> : null}
          </div>
          <FilterMenu
            value={relationship}
            options={relationshipOptions}
            onChange={setRelationship}
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
              placeholder={isNationalId
                ? t('qr.custom.fields.nationalIdPlaceholder')
                : t('qr.custom.fields.identityNumberPlaceholder', { defaultValue: 'National ID or passport number' })}
              disabled={!canCreate}
              className={cn(shownErrors.identityNumber && 'border-error ring-1 ring-error/30')}
              aria-invalid={Boolean(shownErrors.identityNumber)}
            />
            {shownErrors.identityNumber ? (
              <p className="text-xs font-medium text-error">{shownErrors.identityNumber}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className={cn('grid gap-3', isNationalId && 'md:grid-cols-2')}>
            <IdentityImageField
              label={isNationalId
                ? t('qr.custom.fields.identityFront')
                : t('qr.custom.fields.identityImage', { defaultValue: 'ID / passport image' })}
              buttonLabel={isNationalId
                ? t('qr.custom.fields.uploadFront')
                : t('qr.custom.fields.uploadIdentityImage', { defaultValue: 'Upload identity image' })}
              file={identityImage}
              onFile={setIdentityImage}
              error={shownErrors.identityImage}
            />
            {isNationalId ? (
              <IdentityImageField
                label={t('qr.custom.fields.identityBack')}
                buttonLabel={t('qr.custom.fields.uploadBack')}
                file={identityBackImage}
                onFile={setIdentityBackImage}
                error={shownErrors.identityBackImage}
              />
            ) : null}
          </div>
          <p className="text-xs text-on-surface-variant">
            {t('qr.custom.fields.identityImageHint', { defaultValue: 'Staff can compare this with the person at pickup.' })}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('qr.delegate.fields.validOn')}</Label>
            <Input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value || today)}
              disabled={!canCreate}
            />
            <p className="text-xs text-on-surface-variant">{t('qr.delegate.fields.validOnHint')}</p>
          </div>
          <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
            <Checkbox
              checked={requireIdCapture}
              onCheckedChange={(checked) => setRequireIdCapture(Boolean(checked))}
              disabled={!canCreate}
            />
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
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('qr.custom.fields.notesPlaceholder', { defaultValue: 'Example: only valid with original passport' })}
            maxLength={300}
            disabled={!canCreate}
          />
        </div>

        <Button
          type="button"
          onClick={() => void onGenerate()}
          disabled={isBusy || !canCreate}
        >
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>qr_code_2</span>
          {isBusy ? t('common.loading') : t('qr.custom.generate', { defaultValue: 'Generate custom QR' })}
        </Button>
      </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-on-surface">
              {t('qr.custom.savedTitle', { defaultValue: 'Custom QR codes' })}
            </h4>
            <p className="mt-1 text-xs text-on-surface-variant">
              {t('qr.custom.savedHint', { defaultValue: 'Active codes show the QR. Inactive codes stay here until deleted.' })}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
            {t('common.loading')}
          </div>
        ) : customTokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-5 text-sm text-on-surface-variant">
            {t('qr.custom.emptySaved', { defaultValue: 'No custom QR codes created yet.' })}
          </div>
        ) : (
          <div className="space-y-3">
            {customTokens.map((token) => {
              const isActive = token.status === 'active';
              const meta = statusMeta(token.status);
              const identityLabel =
                identityOptions.find((option) => option.value === token.pickupIdentityType)?.label ?? token.pickupIdentityType;
              const name = token.pickupPersonFullName ?? token.delegateName ?? t('qr.custom.unknownPerson', { defaultValue: 'Pickup person' });
              const canRegenerate = canRegenerateFrom(token);

              return (
                <div key={token.id} className="grid gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-[156px_minmax(0,1fr)]">
                  <div className="flex items-center justify-center rounded-xl bg-white p-3">
                    {isActive ? (
                      <QRCodeSVG value={printableQrValue(token.token)} size={128} />
                    ) : (
                      <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface text-on-surface-variant">
                        <span className="material-symbols-outlined text-2xl" aria-hidden>qr_code_2</span>
                        <span className="text-xs font-semibold">{meta.label}</span>
                      </div>
                    )}
                    <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
                      <QRCodeCanvas
                        id={qrCanvasId(token.id)}
                        value={printableQrValue(token.token)}
                        size={512}
                        marginSize={2}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-on-surface">{name}</p>
                          <Badge variant={meta.variant} className="gap-1">
                            <span className="material-symbols-outlined text-sm" aria-hidden>{meta.icon}</span>
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {token.pickupRelationship || t('qr.custom.relationships.other', { defaultValue: 'Other' })} - {identityLabel}: {token.pickupIdentityNumber ?? '-'}
                        </p>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        {t('qr.delegate.expiresLabel')}: {formatDateTime(token.expiresAt)}
                      </p>
                    </div>

                    {token.pickupNotes ? (
                      <p className="rounded-lg bg-surface px-3 py-2 text-xs text-on-surface-variant">
                        {token.pickupNotes}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {token.status !== 'used' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void onRotate(token)}
                          disabled={isBusy || rotatingId === token.id}
                        >
                          <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
                          {rotatingId === token.id
                            ? t('common.loading')
                            : t('qr.rotate', { defaultValue: 'Rotate' })}
                        </Button>
                      ) : null}
                      {token.status !== 'used' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDatePrompt(null);
                            setEditingId(editingId === token.id ? null : token.id);
                          }}
                          disabled={isBusy}
                        >
                          <span className="material-symbols-outlined me-1 text-base" aria-hidden>edit</span>
                          {t('common.edit')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(null);
                          setDatePrompt({ token, action: 'regenerate' });
                        }}
                        disabled={isBusy || !canCreate || !canRegenerate || regeneratingId === token.id}
                      >
                        <span className="material-symbols-outlined me-1 text-base" aria-hidden>autorenew</span>
                        {regeneratingId === token.id
                          ? t('common.loading')
                          : t('qr.custom.generateSameData', { defaultValue: 'Generate same data' })}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => downloadQrImage(token.id, name)}
                      >
                        <span className="material-symbols-outlined me-1 text-base" aria-hidden>image</span>
                        {t('qr.custom.downloadImage', { defaultValue: 'Image' })}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => downloadQrPdf(token.id, name, token.expiresAt)}
                      >
                        <span className="material-symbols-outlined me-1 text-base" aria-hidden>picture_as_pdf</span>
                        PDF
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => printQr(token.id, name, token.expiresAt)}
                      >
                        <span className="material-symbols-outlined me-1 text-base" aria-hidden>print</span>
                        {t('qr.print', { defaultValue: 'Print QR' })}
                      </Button>
                      {token.status !== 'used' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (isActive) {
                              void onUpdateStatus(token, 'inactive');
                              return;
                            }
                            setEditingId(null);
                            setDatePrompt({ token, action: 'activate' });
                          }}
                          disabled={isBusy || statusUpdatingId === token.id || (!isActive && !canCreate)}
                        >
                          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                            {isActive ? 'toggle_off' : 'toggle_on'}
                          </span>
                          {isActive
                            ? t('qr.custom.setInactive', { defaultValue: 'Set inactive' })
                            : t('qr.custom.setActive', { defaultValue: 'Set active' })}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant={isActive ? 'outline' : 'destructive'}
                        size="sm"
                        onClick={() => void onDelete(token)}
                        disabled={isBusy || deletingId === token.id}
                      >
                        <span className="material-symbols-outlined me-1 text-base" aria-hidden>delete</span>
                        {deletingId === token.id ? t('common.loading') : t('common.delete')}
                      </Button>
                    </div>

                    {renderDatePrompt(token.id)}
                    {editingId === token.id ? (
                      <CustomQrEditForm
                        token={token}
                        relationshipOptions={relationshipOptions}
                        identityOptions={identityOptions}
                        minDate={today}
                        maxDate={maxDate}
                        isSaving={isEditing}
                        uploadIdentityImage={uploadIdentityImage}
                        onSave={(values) => onEdit(token, values)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
