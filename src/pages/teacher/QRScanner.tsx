import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { QRScanner } from '@/components/teacher/QRScanner';
import {
  PickupIdentityConfirmDialog,
  type MismatchReason,
  type PickupConfirmDecision,
} from '@/components/teacher/PickupIdentityConfirmDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { attendanceErrorKey } from '@/lib/attendanceApi';
import { parseQrTokenFromText } from '@/lib/parseQrScan';
import { supabase } from '@/lib/supabase';
import {
  resolvePickupIdentity,
  teacherAttendanceToggle,
  type ResolvedPickupIdentity,
} from '@/lib/teacherAttendanceToggle';

type VerifyPayload = {
  qr_token_id?: string | null;
  child_id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  purpose?: 'parent' | 'delegate' | 'event';
  delegate_name?: string | null;
  pickup_person_full_name?: string | null;
  pickup_relationship?: string | null;
  pickup_identity_type?: string | null;
  pickup_identity_number?: string | null;
  pickup_identity_image_path?: string | null;
  pickup_identity_back_image_path?: string | null;
  pickup_notes?: string | null;
  require_id_capture?: boolean | null;
  single_use?: boolean;
  issued_by?: string | null;
  // Event check-in tokens
  event_id?: string | null;
  event_title_ar?: string | null;
  event_title_en?: string | null;
  already_checked_in?: boolean;
  // Today's attendance (nursery timezone), resolved server-side.
  attendance_date?: string;
  attendance_state?: 'none' | 'checked_in' | 'checked_out';
  attendance_id?: string | null;
  check_in?: string | null;
  check_out?: string | null;
};

type DialogState = {
  childName: string;
  pickupPersonName: string | null;
  pickupRole: 'parent' | 'delegate';
  preUploadedPhotoUrl: string | null;
  pickupRelationship: string | null;
  pickupIdentityType: string | null;
  pickupIdentityNumber: string | null;
  pickupIdentityImageUrl: string | null;
  pickupIdentityBackImageUrl: string | null;
  pickupNotes: string | null;
  requireIdCapture: boolean;
};

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function QRScannerPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const { settings } = useNurserySettings(profile?.nursery_id);
  const minScanGapMinutes = settings?.min_minutes_between_scans ?? 5;
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const formatScanTime = useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—',
    [i18n.language],
  );

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const decisionResolverRef = useRef<((d: PickupConfirmDecision | null) => void) | null>(null);

  const childDisplayName = useCallback(
    (payload: VerifyPayload) => {
      if (languagePref === 'ar') return payload.full_name_ar || payload.full_name_en;
      if (languagePref === 'en') return payload.full_name_en || payload.full_name_ar;
      return `${payload.full_name_ar} / ${payload.full_name_en}`;
    },
    [languagePref],
  );

  const awaitDecision = useCallback(
    (state: DialogState): Promise<PickupConfirmDecision | null> => {
      setDialogState(state);
      return new Promise((resolve) => {
        decisionResolverRef.current = resolve;
      });
    },
    [],
  );

  const settleDecision = useCallback((decision: PickupConfirmDecision | null) => {
    const resolver = decisionResolverRef.current;
    decisionResolverRef.current = null;
    setDialogState(null);
    setDialogBusy(false);
    resolver?.(decision);
  }, []);

  const uploadIdPhoto = useCallback(
    async (nurseryId: string, childId: string, file: File): Promise<string> => {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${nurseryId}/${childId}/${Date.now()}-${randomSuffix()}.${ext}`;
      const { error } = await supabase.storage.from('pickup-id-photos').upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      return path;
    },
    [],
  );

  const createSignedStorageUrl = useCallback(async (storageRef: string | null | undefined): Promise<string | null> => {
    if (!storageRef) return null;
    const [bucket, ...pathParts] = storageRef.split(':');
    const path = pathParts.join(':');
    if (!bucket || !path) return storageRef;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30);
    if (error) return null;
    return data.signedUrl;
  }, []);

  const logIncident = useCallback(
    async (args: { payload: VerifyPayload; reason: MismatchReason; note: string }) => {
      if (!profile?.nursery_id || !user?.id) return;
      const { payload, reason, note } = args;
      const { error: insertErr } = await supabase.from('pickup_incidents').insert({
        nursery_id: profile.nursery_id,
        child_id: payload.child_id,
        qr_token_id: payload.qr_token_id ?? null,
        reported_by: user.id,
        reason,
        note: note || null,
      } as never);
      // The server logs the attempt and notifies the child's parents (pickup_incidents trigger).
      if (insertErr) throw insertErr;
    },
    [profile?.nursery_id, user?.id],
  );

  const handleScanResult = useCallback(
    async (rawText: string): Promise<boolean> => {
      const token = parseQrTokenFromText(rawText);
      if (!token) {
        toast.error(t('teacher.scanner.errors.emptyToken'));
        return false;
      }

      try {
        // defer_consume: a one-time QR is spent only when the pickup is confirmed below.
        const { data, error } = await supabase.functions.invoke('qr-verify', {
          body: { token, defer_consume: true },
        });
        if (error) throw error;
        const payload = data as VerifyPayload & { error?: string };
        if (payload?.error) {
          throw new Error(payload.error);
        }
        if (!payload?.child_id || !payload.nursery_id) {
          throw new Error(t('teacher.scanner.errors.invalidResponse'));
        }

        // Event check-in: the edge function already recorded attendance.
        if (payload.purpose === 'event') {
          const eventName =
            (languagePref === 'ar' ? payload.event_title_ar : payload.event_title_en) ||
            payload.event_title_en ||
            payload.event_title_ar ||
            '';
          const childName = childDisplayName(payload);
          if (payload.already_checked_in) {
            toast.info(t('teacher.scanner.event.alreadyCheckedIn', { name: childName, event: eventName }));
          } else {
            toast.success(t('teacher.scanner.event.checkedIn', { name: childName, event: eventName }));
          }
          setLastScanned(`${childName} · ${eventName}`);
          return true;
        }

        const child = {
          id: payload.child_id,
          nursery_id: payload.nursery_id,
          full_name_ar: payload.full_name_ar,
          full_name_en: payload.full_name_en,
        };

        const name = childDisplayName(payload);
        if (payload.attendance_state === 'checked_out') {
          toast.info(t('attendance.scanner.alreadyCheckedOut', {
            name,
            time: formatScanTime(payload.check_out ?? null),
          }));
          setLastScanned(`${name} · ${t('attendance.status.checkedOut')}`);
          return false;
        }

        const existing = payload.attendance_state === 'checked_in' && payload.attendance_id
          ? {
              id: payload.attendance_id,
              child_id: child.id,
              attendance_date: payload.attendance_date ?? '',
              check_in: payload.check_in ?? null,
              check_out: null,
            }
          : null;
        const isCheckout = Boolean(existing);
        const method = payload.purpose === 'delegate' ? 'qr_custom' as const : 'qr_parent' as const;

        // A custom QR is a pickup pass only; the server rejects (and logs) it at drop-off.
        if (!isCheckout && method === 'qr_custom') {
          const rejected = await teacherAttendanceToggle(child, null, payload.attendance_date ?? '', {}, {
            method,
            qrTokenId: payload.qr_token_id ?? null,
          });
          toast.error(t(rejected.mode === 'rejected' ? attendanceErrorKey(rejected.reason) : 'attendance.errors.attendance_custom_qr_pickup_only'));
          setLastScanned(`${name} · ${t('attendance.scanner.rejectedTag')}`);
          return false;
        }

        const pickupCtx = {
          purpose: payload.purpose,
          delegateName: payload.delegate_name ?? null,
          issuedBy: payload.issued_by ?? null,
          pickupPersonFullName: payload.pickup_person_full_name ?? null,
          pickupRelationship: payload.pickup_relationship ?? null,
          pickupIdentityType: payload.pickup_identity_type ?? null,
          pickupIdentityNumber: payload.pickup_identity_number ?? null,
          pickupIdentityImagePath: payload.pickup_identity_image_path ?? null,
          pickupIdentityBackImagePath: payload.pickup_identity_back_image_path ?? null,
          pickupNotes: payload.pickup_notes ?? null,
          requireIdCapture: payload.require_id_capture ?? true,
        };

        // A second scan right after drop-off is an accidental double scan: say so before
        // opening the identity check (the server enforces the same gap).
        if (existing?.check_in) {
          const minutesSinceCheckIn = (Date.now() - new Date(existing.check_in).getTime()) / 60000;
          if (minutesSinceCheckIn < minScanGapMinutes) {
            toast.info(t('attendance.errors.attendance_too_soon', { minutes: minScanGapMinutes }), {
              description: t('attendance.scanner.checkedInAt', { time: formatScanTime(existing.check_in) }),
            });
            setLastScanned(`${name} · ${t('attendance.status.inNursery')}`);
            return false;
          }
        }

        const delegate = payload.purpose === 'delegate'
          ? (payload.pickup_person_full_name ?? payload.delegate_name)?.trim()
          : null;

        // ID verification is only meaningful on check-OUT (handing the child over).
        // Check-IN (drop-off) keeps the existing one-tap flow.
        let resolved: ResolvedPickupIdentity | null = null;
        let idPhotoPath: string | null = null;

        if (isCheckout) {
          resolved = await resolvePickupIdentity(child.id, pickupCtx);
          const [identityImageUrl, identityBackImageUrl] = await Promise.all([
            createSignedStorageUrl(payload.pickup_identity_image_path),
            createSignedStorageUrl(payload.pickup_identity_back_image_path),
          ]);
          const decision = await awaitDecision({
            childName: name,
            pickupPersonName: resolved.pickupPersonName,
            pickupRole: payload.purpose === 'delegate' ? 'delegate' : 'parent',
            preUploadedPhotoUrl: resolved.pickupPhotoUrl,
            pickupRelationship: payload.pickup_relationship ?? null,
            pickupIdentityType: payload.pickup_identity_type ?? null,
            pickupIdentityNumber: payload.pickup_identity_number ?? null,
            pickupIdentityImageUrl: identityImageUrl,
            pickupIdentityBackImageUrl: identityBackImageUrl,
            pickupNotes: payload.pickup_notes ?? null,
            requireIdCapture: payload.require_id_capture ?? true,
          });

          if (!decision) {
            return false;
          }

          if (decision.outcome === 'mismatch') {
            setDialogBusy(true);
            try {
              await logIncident({ payload, reason: decision.reason, note: decision.note });
              toast.error(t('teacher.pickupVerify.mismatchToast', { name }));
            } finally {
              settleDecision(null);
            }
            setLastScanned(`${name} · ${t('teacher.pickupVerify.blockedTag')}`);
            return false;
          }

          // confirmed — upload ID photo then proceed to toggle
          setDialogBusy(true);
          if (decision.idPhotoFile) {
            try {
              idPhotoPath = await uploadIdPhoto(child.nursery_id, child.id, decision.idPhotoFile);
            } catch (uploadErr) {
              settleDecision(null);
              throw uploadErr;
            }
          }
          settleDecision(decision);
        }

        const result = await teacherAttendanceToggle(
          child,
          existing,
          payload.attendance_date ?? '',
          {
            ...pickupCtx,
            preResolved: resolved ?? undefined,
            idPhotoPath,
            identityConfirmed: isCheckout,
          },
          { method, qrTokenId: payload.qr_token_id ?? null },
        );
        await queryClient.invalidateQueries({ queryKey: ['teacher-attendance-today'] });

        if (result.mode === 'rejected') {
          toast.error(t(attendanceErrorKey(result.reason), { minutes: result.minMinutes ?? minScanGapMinutes }));
          setLastScanned(`${name} · ${t('attendance.scanner.rejectedTag')}`);
          return false;
        }
        if (result.mode === 'already_checked_in') {
          toast.info(t('attendance.scanner.alreadyCheckedIn', { name, time: formatScanTime(result.checkIn) }));
          setLastScanned(`${name} · ${t('attendance.status.inNursery')}`);
          return false;
        }
        if (result.mode === 'already_checked_out') {
          toast.info(t('attendance.scanner.alreadyCheckedOut', { name, time: formatScanTime(result.checkOut) }));
          setLastScanned(`${name} · ${t('attendance.status.checkedOut')}`);
          return false;
        }

        setLastScanned(delegate ? `${name} · ${delegate}` : name);

        if (result.mode === 'checkout') {
          if (result.extraHours > 0) {
            toast.success(t('teacher.scanner.successCheckoutLate', { name }), {
              description: t('attendance.scanner.extraHoursSummary', {
                hours: result.extraHours,
                covered: result.extraHoursCovered,
                fee: result.extraFee.toFixed(2),
                minutes: result.lateMinutes,
              }) + (delegate ? ` · ${t('teacher.scanner.delegatePickupShort', { delegate })}` : ''),
            });
          } else {
            toast.success(t('teacher.scanner.successCheckout', { name }), {
              description: delegate
                ? t('teacher.scanner.delegatePickupShort', { delegate })
                : undefined,
            });
          }
        } else {
          toast.success(t('teacher.scanner.successCheckin', { name }));
        }
        return true;
      } catch (e) {
        // Clear any stuck dialog state if we threw partway through.
        if (decisionResolverRef.current) settleDecision(null);
        const key = attendanceErrorKey(e);
        const msg = key === 'attendance.errors.generic'
          ? (e instanceof Error ? e.message : t('teacher.scanner.errors.generic'))
          : t(key);
        toast.error(`${t('teacher.scanner.errors.prefix')}\n${msg}`);
        return false;
      }
    },
    [
      awaitDecision,
      childDisplayName,
      formatScanTime,
      languagePref,
      logIncident,
      minScanGapMinutes,
      queryClient,
      settleDecision,
      t,
      uploadIdPhoto,
      createSignedStorageUrl,
    ],
  );

  const scannerDisabled = !profile?.nursery_id;

  return (
    <div className="relative min-h-[calc(100vh-10rem)] overflow-hidden rounded-3xl bg-primary p-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t('teacher.scanner.title')}</h1>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-white">
          {scannerDisabled ? t('common.loading') : t('teacher.scanner.ready')}
        </span>
      </header>

      <div className="relative mx-auto mt-2 max-w-md rounded-3xl border border-white/20 bg-black/20 p-3">
        <QRScanner onScanResult={handleScanResult} disabled={scannerDisabled} />
      </div>

      <div className="absolute bottom-0 left-0 right-0">
        <BottomSheet>
          <h2 className="text-lg font-semibold text-on-surface">{t('teacher.scanner.sheetTitle')}</h2>
          <p className="mt-2 text-xs text-on-surface-variant">{t('teacher.scanner.sheetBody')}</p>
          <div className="mt-4 rounded-2xl bg-surface-container-low p-3 text-on-surface">
            <p className="text-xs text-on-surface-variant">{t('teacher.scanner.lastScanned')}</p>
            <p className="text-sm font-semibold">
              {lastScanned ?? t('teacher.scanner.lastScannedEmpty')}
            </p>
          </div>
        </BottomSheet>
      </div>

      {dialogState ? (
        <PickupIdentityConfirmDialog
          open
          childName={dialogState.childName}
          pickupPersonName={dialogState.pickupPersonName}
          pickupRole={dialogState.pickupRole}
          preUploadedPhotoUrl={dialogState.preUploadedPhotoUrl}
          pickupRelationship={dialogState.pickupRelationship}
          pickupIdentityType={dialogState.pickupIdentityType}
          pickupIdentityNumber={dialogState.pickupIdentityNumber}
          pickupIdentityImageUrl={dialogState.pickupIdentityImageUrl}
          pickupIdentityBackImageUrl={dialogState.pickupIdentityBackImageUrl}
          pickupNotes={dialogState.pickupNotes}
          requireIdCapture={dialogState.requireIdCapture}
          busy={dialogBusy}
          onDecision={(d) => settleDecision(d)}
          onCancel={() => settleDecision(null)}
        />
      ) : null}
    </div>
  );
}
