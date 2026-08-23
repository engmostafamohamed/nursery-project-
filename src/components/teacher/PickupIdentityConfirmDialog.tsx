import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type MismatchReason = 'mismatch_photo' | 'mismatch_challenge' | 'no_id' | 'other';

export type PickupConfirmDecision =
  | { outcome: 'confirmed'; idPhotoFile: File }
  | { outcome: 'mismatch'; reason: MismatchReason; note: string };

type Props = {
  open: boolean;
  childName: string;
  pickupPersonName: string | null;
  pickupRole: 'parent' | 'delegate';
  preUploadedPhotoUrl: string | null;
  onDecision: (decision: PickupConfirmDecision) => void;
  onCancel: () => void;
  busy?: boolean;
};

export function PickupIdentityConfirmDialog({
  open,
  childName,
  pickupPersonName,
  pickupRole,
  preUploadedPhotoUrl,
  onDecision,
  onCancel,
  busy,
}: Props) {
  const { t } = useTranslation();
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchReason, setMismatchReason] = useState<MismatchReason>('mismatch_photo');
  const [mismatchNote, setMismatchNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (idPreviewUrl) URL.revokeObjectURL(idPreviewUrl);
    };
  }, [idPreviewUrl]);

  const handleFile = (file: File | null) => {
    setIdPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIdPhoto(file);
    if (file) setIdPreviewUrl(URL.createObjectURL(file));
  };

  const handleConfirm = () => {
    if (!idPhoto || busy) return;
    onDecision({ outcome: 'confirmed', idPhotoFile: idPhoto });
  };

  const handleSubmitMismatch = () => {
    if (busy) return;
    onDecision({
      outcome: 'mismatch',
      reason: mismatchReason,
      note: mismatchNote.trim(),
    });
  };

  const roleLabel =
    pickupRole === 'delegate'
      ? t('teacher.pickupVerify.roleDelegate')
      : t('teacher.pickupVerify.roleParent');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        {!mismatchOpen ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('teacher.pickupVerify.title', { name: childName })}</DialogTitle>
              <DialogDescription>{t('teacher.pickupVerify.subtitle')}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                  {t('teacher.pickupVerify.pickupPersonLabel')}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-base font-semibold text-on-surface">
                    {pickupPersonName ?? t('teacher.pickupVerify.unknownPerson')}
                  </p>
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 text-xs font-medium ' +
                      (pickupRole === 'delegate'
                        ? 'border-secondary/30 bg-secondary/10 text-secondary'
                        : 'border-primary/30 bg-primary/10 text-primary')
                    }
                  >
                    {roleLabel}
                  </span>
                </div>
              </div>

              {preUploadedPhotoUrl ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-on-surface-variant">
                    {t('teacher.pickupVerify.photoOnFile')}
                  </p>
                  <img
                    src={preUploadedPhotoUrl}
                    alt={pickupPersonName ?? ''}
                    className="mx-auto h-48 w-48 rounded-2xl border border-outline-variant object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  {t('teacher.pickupVerify.noPhotoWarning')}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-on-surface-variant">
                  {t('teacher.pickupVerify.captureIdLabel')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                {idPreviewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={idPreviewUrl}
                      alt=""
                      className="mx-auto h-40 w-full rounded-xl border border-outline-variant object-cover"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={busy}
                    >
                      <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                        replay
                      </span>
                      {t('teacher.pickupVerify.retakeId')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    <span className="material-symbols-outlined me-2" aria-hidden>
                      photo_camera
                    </span>
                    {t('teacher.pickupVerify.captureIdButton')}
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMismatchOpen(true)}
                disabled={busy}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                  block
                </span>
                {t('teacher.pickupVerify.reportMismatch')}
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={!idPhoto || busy}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                  check
                </span>
                {t('teacher.pickupVerify.confirmMatch')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('teacher.pickupVerify.mismatchTitle')}</DialogTitle>
              <DialogDescription>{t('teacher.pickupVerify.mismatchSubtitle')}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              {(['mismatch_photo', 'mismatch_challenge', 'no_id', 'other'] as const).map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant p-3 text-sm hover:bg-surface-container-lowest"
                >
                  <input
                    type="radio"
                    name="mismatch-reason"
                    className="mt-1"
                    checked={mismatchReason === r}
                    onChange={() => setMismatchReason(r)}
                  />
                  <span>{t(`teacher.pickupVerify.reason_${r}`)}</span>
                </label>
              ))}

              <textarea
                value={mismatchNote}
                onChange={(e) => setMismatchNote(e.target.value)}
                placeholder={t('teacher.pickupVerify.mismatchNotePlaceholder')}
                className="min-h-[80px] w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMismatchOpen(false)}
                disabled={busy}
              >
                {t('common.back')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleSubmitMismatch}
                disabled={busy}
              >
                {t('teacher.pickupVerify.confirmMismatch')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
