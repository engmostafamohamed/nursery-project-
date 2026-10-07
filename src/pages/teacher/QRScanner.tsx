import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
  PickupIdentityConfirmDialog,
  type MismatchReason,
  type PickupConfirmDecision,
} from '@/components/teacher/PickupIdentityConfirmDialog';
import { ManualCodeEntry } from '@/components/teacher/scanner/ManualCodeEntry';
import { QrCameraView } from '@/components/teacher/scanner/QrCameraView';
import { LastScanCard, SessionHistory, type ScanEntry } from '@/components/teacher/scanner/ScanResults';
import { HowItWorksCard, TodayAtGateCard } from '@/components/teacher/scanner/ScannerSideCards';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useQrCamera, type QrCamera } from '@/hooks/useQrCamera';
import { useUserProfile } from '@/hooks/useUserProfile';
import { attendanceErrorKey } from '@/lib/attendanceApi';
import { parseQrTokenFromText } from '@/lib/parseQrScan';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
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

// qr-verify answers refusals with an English sentence and a 4xx status; map them to the
// attendance.errors.* codes the app already translates.
const QR_VERIFY_REFUSALS: ReadonlyArray<[RegExp, string]> = [
  [/expired/i, 'attendance_qr_expired'],
  [/already been used/i, 'attendance_qr_used'],
  [/different nursery|only nursery staff/i, 'attendance_forbidden'],
  [/not active/i, 'attendance_child_not_active'],
  [/child not found/i, 'attendance_child_not_found'],
  [/invalid qr|token is required|invalid event qr/i, 'attendance_qr_invalid'],
];

/** supabase.functions.invoke only reports "non-2xx status code"; the real reason is in the body. */
async function qrVerifyRefusal(error: unknown): Promise<string> {
  let message = error instanceof Error ? error.message : String(error ?? '');
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Non-JSON body: keep the generic message.
    }
  }
  return QR_VERIFY_REFUSALS.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

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

/** Recent scans kept on screen (the full record is in the attendance logs). */
const HISTORY_LIMIT = 20;

type ChipState = 'starting' | 'scanning' | 'processing' | 'error' | 'unavailable';

const CHIP_STYLE: Record<ChipState, { chip: string; dot: string }> = {
  starting: { chip: 'bg-warning/10 text-warning', dot: 'bg-warning animate-pulse' },
  scanning: { chip: 'bg-success/10 text-success', dot: 'bg-success animate-pulse' },
  processing: { chip: 'bg-primary/10 text-primary', dot: 'bg-primary animate-pulse' },
  error: { chip: 'bg-error/10 text-error', dot: 'bg-error' },
  unavailable: { chip: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' },
};

function CameraStatusChip({ state }: { state: ChipState }) {
  const { t } = useTranslation();
  const style = CHIP_STYLE[state];
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold', style.chip)}>
      <span className={cn('h-2 w-2 rounded-full', style.dot)} aria-hidden />
      {t(`teacher.scanner.status.${state}`)}
    </span>
  );
}

function chipState(camera: QrCamera, blocked: 'loading' | 'no_nursery' | null, processing: boolean): ChipState {
  if (blocked === 'no_nursery') return 'unavailable';
  if (blocked === 'loading') return 'starting';
  if (camera.status === 'error') return 'error';
  if (camera.status === 'starting') return 'starting';
  return processing ? 'processing' : 'scanning';
}

/** A short buzz for a recorded scan, a double one for a refused scan (phones that support it). */
function vibrate(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
  } catch {
    // Not available on this device.
  }
}

export function QRScannerPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const { settings, isLoading: settingsLoading } = useNurserySettings(profile?.nursery_id);
  const minScanGapMinutes = settings?.min_minutes_between_scans ?? 5;
  const [history, setHistory] = useState<ScanEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const entryIdRef = useRef(0);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const linkTokenHandledRef = useRef(false);
  const elementId = `qr-camera-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const record = useCallback((entry: Omit<ScanEntry, 'id' | 'at'>) => {
    entryIdRef.current += 1;
    const next: ScanEntry = { ...entry, id: entryIdRef.current, at: Date.now() };
    setHistory((list) => [next, ...list].slice(0, HISTORY_LIMIT));
    vibrate(entry.outcome === 'checkin' || entry.outcome === 'checkout' || entry.outcome === 'event');
  }, []);

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
        if (error) throw new Error(await qrVerifyRefusal(error));
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
          record({ name: childName, outcome: payload.already_checked_in ? 'already' : 'event', detail: eventName || null });
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
          record({ name, outcome: 'already', detail: t('teacher.scanner.result.alreadyOut', { time: formatScanTime(payload.check_out ?? null) }) });
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
          const message = t(rejected.mode === 'rejected' ? attendanceErrorKey(rejected.reason) : 'attendance.errors.attendance_custom_qr_pickup_only');
          toast.error(message);
          record({ name, outcome: 'rejected', detail: message });
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
            record({ name, outcome: 'already', detail: t('teacher.scanner.result.alreadyIn', { time: formatScanTime(existing.check_in) }) });
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
            record({ name, outcome: 'blocked', detail: resolved.pickupPersonName ?? null });
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
        void queryClient.invalidateQueries({ queryKey: ['attendance-kpis'] });

        if (result.mode === 'rejected') {
          const message = t(attendanceErrorKey(result.reason), { minutes: result.minMinutes ?? minScanGapMinutes });
          toast.error(message);
          record({ name, outcome: 'rejected', detail: message });
          return false;
        }
        if (result.mode === 'already_checked_in') {
          toast.info(t('attendance.scanner.alreadyCheckedIn', { name, time: formatScanTime(result.checkIn) }));
          record({ name, outcome: 'already', detail: t('teacher.scanner.result.alreadyIn', { time: formatScanTime(result.checkIn) }) });
          return false;
        }
        if (result.mode === 'already_checked_out') {
          toast.info(t('attendance.scanner.alreadyCheckedOut', { name, time: formatScanTime(result.checkOut) }));
          record({ name, outcome: 'already', detail: t('teacher.scanner.result.alreadyOut', { time: formatScanTime(result.checkOut) }) });
          return false;
        }

        const delegateText = delegate ? t('teacher.scanner.delegatePickupShort', { delegate }) : null;
        if (result.mode === 'checkout') {
          const extraText = result.extraHours > 0
            ? t('attendance.scanner.extraHoursSummary', {
                hours: result.extraHours,
                covered: result.extraHoursCovered,
                fee: result.extraFee.toFixed(2),
                minutes: result.lateMinutes,
              })
            : null;
          const detail = [extraText, delegateText].filter(Boolean).join(' · ') || null;
          toast.success(t(extraText ? 'teacher.scanner.successCheckoutLate' : 'teacher.scanner.successCheckout', { name }), {
            description: detail ?? undefined,
          });
          record({ name, outcome: 'checkout', detail });
        } else {
          toast.success(t('teacher.scanner.successCheckin', { name }));
          record({ name, outcome: 'checkin', detail: null });
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
        record({ name: t('teacher.scanner.result.unknownCode'), outcome: 'rejected', detail: msg });
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
      record,
      settleDecision,
      t,
      uploadIdPhoto,
      createSignedStorageUrl,
    ],
  );

  // Camera and manual entry share one queue: while a code is being checked (identity dialog
  // included) nothing else is started.
  const runScan = useCallback(
    async (text: string): Promise<boolean> => {
      if (processingRef.current) return false;
      processingRef.current = true;
      setProcessing(true);
      try {
        return await handleScanResult(text);
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [handleScanResult],
  );

  const blocked: 'loading' | 'no_nursery' | null = profilePending ? 'loading' : profile?.nursery_id ? null : 'no_nursery';
  const camera = useQrCamera({ elementId, enabled: !blocked, onScan: runScan });

  // Opened from a QR link (/qr/verify?token=…): check that code as if it had just been scanned.
  // Waits for the nursery settings, so the scan-gap check uses the nursery's own value.
  const linkToken = searchParams.get('token');
  useEffect(() => {
    if (!linkToken || blocked || settingsLoading || linkTokenHandledRef.current) return;
    linkTokenHandledRef.current = true;
    // Take the token out of the address first, so a refresh or Back does not check it again.
    setSearchParams(
      (params) => {
        params.delete('token');
        return params;
      },
      { replace: true },
    );
    void runScan(linkToken);
  }, [linkToken, blocked, settingsLoading, runScan, setSearchParams]);
  const attendanceLink = location.pathname.startsWith('/admin') ? '/admin/attendance' : '/teacher/attendance';
  const focusManual = () => {
    manualInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    manualInputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-on-surface">{t('teacher.scanner.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-on-surface-variant">{t('teacher.scanner.subtitle')}</p>
        </div>
        <CameraStatusChip state={chipState(camera, blocked, processing)} />
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="lg:sticky lg:top-6">
          <QrCameraView
            elementId={elementId}
            camera={camera}
            blocked={blocked}
            processing={processing}
            onUseManual={focusManual}
          />
        </div>

        <div className="space-y-4">
          <LastScanCard entry={history[0] ?? null} />
          <ManualCodeEntry inputRef={manualInputRef} busy={processing} onSubmit={runScan} />
          <TodayAtGateCard nurseryId={profile?.nursery_id} attendanceLink={attendanceLink} />
          <SessionHistory entries={history} />
          <HowItWorksCard />
        </div>
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
