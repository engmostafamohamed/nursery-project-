import { useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ParentPermissionCard as Row, ParentPermissionTab } from '@/hooks/useParentPermissionsPage';
import { getUserInitials } from '@/lib/utils';

function categoryClass(cat: string): string {
  switch (cat) {
    case 'trip':
      return 'border-transparent bg-violet-100 text-violet-900';
    case 'activity':
      return 'border-transparent bg-info/10 text-info';
    case 'service':
      return 'border-transparent bg-accent text-accent-foreground';
    case 'doctor_visit':
      return 'border-transparent bg-success/10 text-success';
    default:
      return 'border-outline-variant bg-surface-container text-on-surface';
  }
}

type DeadlineCountdown =
  | { tone: 'info'; kind: 'days'; count: number }
  | { tone: 'warning'; kind: 'hours'; count: number }
  | { tone: 'urgent'; kind: 'soon' };

function getDeadlineCountdown(deadlineIso: string, nowMs: number): DeadlineCountdown | null {
  const diff = new Date(deadlineIso).getTime() - nowMs;
  if (diff <= 0) return null;
  const hoursTotal = diff / (3600 * 1000);
  if (hoursTotal > 24) {
    const days = Math.floor(hoursTotal / 24);
    return { tone: 'info', kind: 'days', count: Math.max(1, days) };
  }
  if (hoursTotal >= 1) {
    const hours = Math.max(1, Math.ceil(hoursTotal));
    return { tone: 'warning', kind: 'hours', count: hours };
  }
  return { tone: 'urgent', kind: 'soon' };
}

function countdownBadgeClass(tone: DeadlineCountdown['tone']): string {
  switch (tone) {
    case 'info':
      return 'border-info/40 bg-info/10 text-info';
    case 'warning':
      return 'border-warning/40 bg-warning/10 text-warning';
    case 'urgent':
      return 'border-error/40 bg-error/10 text-error';
  }
}

type BusyAction = 'approve' | 'deny' | null;

type Props = {
  row: Row;
  tab: ParentPermissionTab;
  busyId: string | null;
  busyAction: BusyAction;
  dateFmt: Intl.DateTimeFormat;
  priceFmt: Intl.NumberFormat;
  onApprove: (row: Row) => void;
  onDenyOpen: (row: Row) => void;
};

export function ParentPermissionCardView({
  row,
  tab,
  busyId,
  busyAction,
  dateFmt,
  priceFmt,
  onApprove,
  onDenyOpen,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const nowMs = useMemo(() => Date.now(), []);

  const displayTitle = (r: Row) =>
    (i18n.language.startsWith('ar') ? r.title_ar : r.title_en) || r.title_en || r.title_ar;
  const displayChild = (r: Row) =>
    (i18n.language.startsWith('ar') ? r.childNameAr : r.childNameEn) || r.childNameEn || r.childNameAr;
  const displayDescription = (r: Row) => {
    const d = i18n.language.startsWith('ar') ? r.description_ar : r.description_en;
    return d?.trim() || null;
  };

  const effectiveDeadline = row.event_permission_deadline || row.deadline;
  const desc = displayDescription(row);
  const isPending = tab === 'pending' && row.status === 'pending';
  const isBusy = busyId === row.id;
  const priceAmount = row.price != null && row.price !== '' ? priceFmt.format(Number(row.price)) : '—';

  const countdown =
    isPending && effectiveDeadline ? getDeadlineCountdown(effectiveDeadline, nowMs) : null;

  const countdownVisible =
    countdown == null
      ? ''
      : countdown.kind === 'soon'
        ? t('parent.permissions.card.lessThanOneHour')
        : countdown.kind === 'days'
          ? t('parent.permissions.card.countdownDays', { count: countdown.count })
          : t('parent.permissions.card.countdownHours', { count: countdown.count });

  const showPaymentRequired = isPending && row.is_paid;
  const showPayAlert = showPaymentRequired;

  return (
    <article className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {row.avatar_url ? (
            <AvatarImage src={row.avatar_url} alt={displayChild(row)} />
          ) : null}
          <AvatarFallback>{getUserInitials(displayChild(row), null)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-on-surface">{displayChild(row)}</p>
          <p className="text-base font-semibold text-on-surface">{displayTitle(row)}</p>
          {desc ? (
            <p className="line-clamp-3 text-sm text-on-surface-variant" title={desc}>
              {desc}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(`/parent/events/${row.event_id}`)}
            className="inline-flex items-center gap-1 text-sm font-medium text-secondary underline-offset-2 hover:underline"
            aria-label={t('parent.permissions.card.ariaViewDetails')}
          >
            <span>{t('parent.permissions.card.viewDetails')}</span>
            <span className="material-symbols-outlined text-base rtl:-scale-x-100" aria-hidden>
              arrow_forward
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
            <span
              className="inline-flex items-center gap-1"
              aria-label={`${t('parent.permissions.card.ariaCalendar')}: ${dateFmt.format(new Date(row.starts_at))}`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                calendar_month
              </span>
              <time dateTime={row.starts_at}>{dateFmt.format(new Date(row.starts_at))}</time>
            </span>
            {row.location ? (
              <span
                className="inline-flex min-w-0 items-center gap-1"
                aria-label={`${t('parent.permissions.card.ariaLocation')}: ${row.location}`}
              >
                <span className="material-symbols-outlined shrink-0 text-base" aria-hidden>
                  location_on
                </span>
                <span className="min-w-0 break-words">{row.location}</span>
              </span>
            ) : null}
            {countdown ? (
              <span className="inline-flex items-center" aria-live="polite" aria-atomic="true">
                <Badge
                  className={`border ${countdownBadgeClass(countdown.tone)}`}
                  aria-label={t('parent.permissions.card.countdownSr', { text: countdownVisible })}
                >
                  {countdownVisible}
                </Badge>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge className={categoryClass(row.category)}>
          {t(`admin.events.create.categories.${row.category}`, { defaultValue: row.category })}
        </Badge>
        {row.is_paid && row.price ? (
          <Badge className="border-transparent bg-secondary-container/30 text-on-secondary-container">
            {t('parent.permissions.paid', { amount: priceFmt.format(Number(row.price)) })}
          </Badge>
        ) : (
          <Badge className="border-outline-variant bg-surface-container text-on-surface-variant">
            {t('parent.permissions.free')}
          </Badge>
        )}
        {showPaymentRequired ? (
          <Badge
            className="border border-warning/60 bg-warning/10 text-warning"
            aria-label={t('parent.permissions.card.ariaPaymentsBadge')}
          >
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-base" aria-hidden>
                payments
              </span>
              {t('parent.permissions.card.paymentRequired')}
            </span>
          </Badge>
        ) : null}
      </div>
      {effectiveDeadline ? (
        <p className="text-xs text-on-surface-variant">
          {t('parent.permissions.deadline', { date: dateFmt.format(new Date(effectiveDeadline)) })}
        </p>
      ) : null}
      {showPayAlert ? (
        <div
          role="status"
          aria-live="polite"
          className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
        >
          <span className="material-symbols-outlined shrink-0 text-warning" aria-hidden>
            warning
          </span>
          <p className="min-w-0 leading-snug">
            <Trans
              i18nKey="parent.permissions.card.payAgreement"
              values={{ amount: priceAmount }}
              components={{ bold: <strong className="font-semibold text-warning" /> }}
            />
          </p>
        </div>
      ) : null}
      {tab !== 'pending' && row.responded_at ? (
        <p className="text-xs text-on-surface-variant">
          {t('parent.permissions.respondedAt', { date: dateFmt.format(new Date(row.responded_at)) })}
        </p>
      ) : null}
      {tab === 'denied' && row.parent_note ? (
        <p className="text-xs text-on-surface-variant">
          {t('parent.permissions.yourNote')}: {row.parent_note}
        </p>
      ) : null}
      {isPending ? (
        <div className="flex w-full flex-col gap-2 pt-1 sm:flex-row sm:items-stretch">
          <Button
            type="button"
            size="lg"
            className="w-full gap-2 bg-success text-white hover:bg-success/90 sm:order-1 sm:flex-[2]"
            disabled={isBusy}
            aria-busy={isBusy && busyAction === 'approve'}
            onClick={() => onApprove(row)}
          >
            {isBusy && busyAction === 'approve' ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin text-xl"
                  aria-hidden
                >
                  progress_activity
                </span>
                <span className="sr-only">{t('parent.permissions.card.ariaSpinner')}</span>
                {t('parent.permissions.card.approving')}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl" aria-hidden>
                  check_circle
                </span>
                {t('parent.permissions.approve')}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-error text-error hover:bg-error-container sm:order-2 sm:flex-1"
            disabled={isBusy}
            aria-busy={isBusy && busyAction === 'deny'}
            onClick={() => onDenyOpen(row)}
          >
            {isBusy && busyAction === 'deny' ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin text-xl"
                  aria-hidden
                >
                  progress_activity
                </span>
                <span className="sr-only">{t('parent.permissions.card.ariaSpinner')}</span>
                {t('parent.permissions.card.denying')}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl" aria-hidden>
                  cancel
                </span>
                {t('parent.permissions.deny')}
              </>
            )}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
