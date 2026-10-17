import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { SignedPaymentProofLink } from '@/components/admin/SignedPaymentProofLink';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { useNurseryClasses, type NurseryClassRow } from '@/hooks/useClassStaff';
import type { PaymentAttemptItem } from '@/hooks/usePaymentAttempts';
import { formatDateTime } from '@/lib/datetime';
import { confirmPaymentAttempt, paymentError } from '@/lib/paymentApi';
import { cn } from '@/lib/utils';

/** The admission application a payment pays for, so confirming it can also enroll the child. */
export type EnrollAfterPayment = {
  childName: string;
  nurseryId: string;
  /** Why the application cannot be approved yet (for example, still a draft); null when it can. */
  blockedReason: string | null;
  /** Approves the application and says where the child was placed. */
  approve: (classId: string | null) => Promise<{ childId: string | null; classId: string | null }>;
};

type Enrollment = { childId: string | null; classId: string | null; className: string | null } | { error: string };

type Outcome = {
  amount: number;
  invoicePaid: boolean;
  /** Null when the admin did not enroll the child in this step. */
  enrollment: Enrollment | null;
  // Copied at confirm time: once the application is approved the page stops passing `enroll`.
  childName: string;
  enrollOffered: boolean;
};

interface Props {
  /** The payment to confirm; the dialog is open while this is set. */
  attempt: PaymentAttemptItem | null;
  methodLabel: (method: string) => string;
  /** Invoice number shown next to the payment, when known. */
  invoiceLabel?: string;
  enroll?: EnrollAfterPayment | null;
  onClose: () => void;
  /** Refreshes the page's payment lists after a confirmation. */
  onConfirmed: () => Promise<void>;
}

const isTestPayment = (attempt: PaymentAttemptItem) => attempt.notes?.startsWith('[TEST PAYMENT]') === true;

function money(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Finance's last check before a parent's payment is recorded. Shows what the parent says they
 * paid, asks the admin to confirm the money arrived, and — for an admission payment — can approve
 * the application in the same step, then points to the next step: giving the child a class.
 */
export function ConfirmPaymentDialog({ attempt, ...rest }: Props) {
  return (
    <Dialog open={attempt !== null} onOpenChange={(open) => (!open ? rest.onClose() : undefined)}>
      {attempt ? <ConfirmPaymentBody key={attempt.id} attempt={attempt} {...rest} /> : null}
    </Dialog>
  );
}

function ConfirmPaymentBody({
  attempt,
  methodLabel,
  invoiceLabel,
  enroll,
  onClose,
  onConfirmed,
}: Omit<Props, 'attempt'> & { attempt: PaymentAttemptItem }) {
  const { t, i18n } = useTranslation();
  const canEnroll = Boolean(enroll && !enroll.blockedReason);
  const classesQuery = useNurseryClasses(canEnroll ? enroll?.nurseryId : null);
  const [verified, setVerified] = useState(false);
  const [enrollNow, setEnrollNow] = useState(canEnroll);
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const isAr = i18n.language?.startsWith('ar');
  const className = (c: Pick<NurseryClassRow, 'name_ar' | 'name_en'>) =>
    (isAr ? c.name_ar || c.name_en : c.name_en || c.name_ar) || '—';
  const amountText = t('invoice.egpAmount', { amount: money(attempt.amount) });
  const testPayment = isTestPayment(attempt);

  const copyReference = async () => {
    if (!attempt.reference) return;
    try {
      await navigator.clipboard.writeText(attempt.reference);
      toast.success(t('payment.admin.confirmDialog.copied'));
    } catch {
      // Clipboard blocked: the reference is still on screen to copy by hand.
    }
  };

  const confirmPayment = async () => {
    setBusy(true);
    try {
      const result = await confirmPaymentAttempt(attempt.id);
      let enrollment: Enrollment | null = null;
      if (enroll && canEnroll && enrollNow) {
        try {
          const placed = await enroll.approve(classId || null);
          const chosen = (classesQuery.data ?? []).find((c) => c.id === placed.classId);
          enrollment = { ...placed, className: chosen ? className(chosen) : null };
        } catch (error) {
          const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
          enrollment = {
            error: message.includes('enrollment_class_not_found')
              ? t('applications.enroll.errors.classNotFound')
              : message,
          };
        }
      }
      setOutcome({
        amount: result.confirmedAmount,
        invoicePaid: result.invoiceStatus === 'paid',
        enrollment,
        childName: enroll?.childName ?? '',
        enrollOffered: canEnroll,
      });
      await onConfirmed();
    } catch (error) {
      const { key, values } = paymentError(error);
      toast.error(t(key, values));
    } finally {
      setBusy(false);
    }
  };

  if (outcome) {
    return (
      <DialogContent className="max-w-md">
        <ConfirmedSummary outcome={outcome} onNavigate={onClose} />
        <DialogFooter className="mt-4">
          <Button onClick={onClose}>{t('payment.admin.confirmDialog.done')}</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader className="items-center text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MaterialSymbol name="price_check" size="text-3xl" />
        </span>
        <DialogTitle className="pt-2 text-center">{t('payment.admin.confirmTitle')}</DialogTitle>
        <DialogDescription className="text-center">{t('payment.admin.confirmDialog.subtitle')}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        {/* What the parent says they paid */}
        <div className="rounded-xl border border-outline-variant bg-surface p-4 text-center">
          <p className="text-3xl font-bold tracking-tight text-on-surface">{amountText}</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('payment.admin.confirmDialog.fromParentBy', { parent: attempt.parentName, method: methodLabel(attempt.method) })}
          </p>
        </div>

        {testPayment ? (
          <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {t('payment.admin.testPaymentNotice')}
          </p>
        ) : null}

        <dl className="divide-y divide-outline-variant rounded-xl border border-outline-variant text-sm">
          {attempt.reference ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-on-surface-variant">{t('payment.reference')}</dt>
              <dd className="flex items-center gap-1">
                <span className="break-all font-mono font-semibold text-on-surface" dir="ltr">
                  {attempt.reference}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={t('payment.admin.confirmDialog.copyReference')}
                  onClick={() => void copyReference()}
                >
                  <MaterialSymbol name="content_copy" size="text-base" />
                </Button>
              </dd>
            </div>
          ) : null}
          {invoiceLabel ? <DetailRow label={t('payment.admin.confirmDialog.invoice')} value={invoiceLabel} mono /> : null}
          <DetailRow label={t('payment.admin.confirmDialog.submittedAt')} value={formatDateTime(attempt.createdAt)} />
          {attempt.paymobIntentionId ? (
            <DetailRow label={t('payment.admin.paymobIntentionId')} value={attempt.paymobIntentionId} mono />
          ) : null}
        </dl>

        {attempt.paymobIntentionId ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <MaterialSymbol name="warning" size="text-base" />
            <span>{t('payment.admin.paymobVerifyBeforeConfirm', { id: attempt.paymobIntentionId })}</span>
          </p>
        ) : null}

        {attempt.proofUrl ? <SignedPaymentProofLink proofUrl={attempt.proofUrl} /> : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {t('payment.admin.confirmDialog.whatHappens')}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-on-surface">
            <li className="flex items-start gap-2">
              <MaterialSymbol name="receipt_long" size="text-base" className="text-primary" />
              {t('payment.admin.confirmDialog.happensRecorded')}
            </li>
            <li className="flex items-start gap-2">
              <MaterialSymbol name="notifications" size="text-base" className="text-primary" />
              {t('payment.admin.confirmDialog.happensNotified')}
            </li>
          </ul>
        </div>

        {enroll ? (
          <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <MaterialSymbol name="child_care" size="text-lg" className="text-primary" />
              {t('applications.enroll.sectionTitle')}
            </p>
            {enroll.blockedReason ? (
              <p className="text-xs text-on-surface-variant">{enroll.blockedReason}</p>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="enroll-now"
                    checked={enrollNow}
                    onCheckedChange={(checked) => setEnrollNow(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="enroll-now" className="cursor-pointer text-sm font-medium">
                      {t('applications.enroll.approveNow', { child: enroll.childName })}
                    </Label>
                    <p className="text-xs text-on-surface-variant">{t('applications.enroll.approveNowHelp')}</p>
                  </div>
                </div>
                {enrollNow ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="enroll-class">{t('applications.enroll.classLabel')}</Label>
                    <Select
                      id="enroll-class"
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                      className="h-11 text-sm"
                      disabled={classesQuery.isLoading}
                    >
                      <option value="">{t('applications.enroll.noClass')}</option>
                      {(classesQuery.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {t('applications.enroll.classOption', { name: className(c), count: c.child_count })}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-on-surface-variant">{t('applications.enroll.createClassHint')}</p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <Checkbox
            id="payment-verified"
            checked={verified}
            onCheckedChange={(checked) => setVerified(checked === true)}
            disabled={testPayment}
            className="mt-0.5"
          />
          <Label htmlFor="payment-verified" className="cursor-pointer text-sm font-medium leading-snug">
            {t('payment.admin.confirmDialog.verifiedCheck', { amount: amountText })}
          </Label>
        </div>
      </div>

      <DialogFooter className="mt-5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => void confirmPayment()}
          disabled={!verified || busy || testPayment}
          aria-busy={busy}
        >
          <MaterialSymbol name={busy ? 'progress_activity' : 'check'} size="text-base" className={cn(busy && 'animate-spin')} />
          {busy ? t('payment.admin.confirmDialog.confirming') : t('payment.admin.confirm')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={cn('break-all text-end font-medium text-on-surface', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

/** After confirming: what was recorded, whether the child was enrolled, and the next step. */
function ConfirmedSummary({
  outcome,
  onNavigate,
}: {
  outcome: Outcome;
  /** Closes the dialog when one of the next-step links is followed. */
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const { childName, enrollOffered } = outcome;
  const amountText = t('invoice.egpAmount', { amount: money(outcome.amount) });
  const enrollment = outcome.enrollment;
  const enrolled = enrollment && !('error' in enrollment) ? enrollment : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <MaterialSymbol name="check_circle" size="text-3xl" />
        </span>
        <DialogTitle>{t('payment.admin.confirmDialog.doneTitle')}</DialogTitle>
        <DialogDescription className="text-center">
          {outcome.invoicePaid
            ? t('payment.admin.confirmDialog.doneAmount', { amount: amountText })
            : t('payment.admin.confirmDialog.doneAmountPartial', { amount: amountText })}
        </DialogDescription>
      </div>

      {enrolled ? (
        <div className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-3">
          <p className="flex items-start gap-2 text-sm font-medium text-on-surface">
            <MaterialSymbol name="how_to_reg" size="text-lg" className="text-success" />
            {enrolled.className
              ? t('applications.enroll.addedInClass', { child: childName, className: enrolled.className })
              : t('applications.enroll.addedNoClass', { child: childName })}
          </p>
          {!enrolled.classId ? (
            <div className="space-y-2 rounded-lg bg-surface p-3">
              <p className="text-sm font-semibold text-on-surface">{t('applications.enroll.nextStepTitle', { child: childName })}</p>
              <p className="text-xs text-on-surface-variant">{t('applications.enroll.nextStepBody', { child: childName })}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" className="gap-1" asChild>
                  <Link to="/admin/classes/new" onClick={onNavigate}>
                    <MaterialSymbol name="add" size="text-base" />
                    {t('applications.enroll.createClass')}
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/admin/classes" onClick={onNavigate}>
                    {t('applications.enroll.openClasses')}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
          {enrolled.childId ? (
            <Button size="sm" variant="ghost" className="gap-1" asChild>
              <Link to={`/admin/children/${enrolled.childId}`} onClick={onNavigate}>
                <MaterialSymbol name="badge" size="text-base" />
                {t('applications.enroll.openChild')}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : enrollment && 'error' in enrollment ? (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error">
          {t('applications.enroll.failed', { message: enrollment.error })}
        </p>
      ) : enrollOffered ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface-variant">
          {t('applications.enroll.notApprovedYet', { child: childName })}
        </p>
      ) : null}
    </div>
  );
}
