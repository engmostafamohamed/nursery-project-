import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, type PillTone } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { usePagination } from '@/hooks/usePagination';
import {
  useParentIssuedQrTokens,
  type IssuedQrStatus,
  type IssuedQrToken,
} from '@/hooks/useParentIssuedQrTokens';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

type ChildLabel = { id: string; nursery_id: string; displayName: string };

type Props = {
  parentId: string | undefined;
  /** Used to render child names + pass nursery_id to the revoke call. */
  children: ChildLabel[];
  /** On one child's QR page: list only that child's codes. */
  childId?: string;
};

type StatusFilter = 'all' | IssuedQrStatus;

const STATUS_ORDER: IssuedQrStatus[] = ['active', 'used', 'expired', 'revoked'];

const STATUS_TONE: Record<IssuedQrStatus, PillTone> = {
  active: 'success',
  used: 'primary',
  expired: 'neutral',
  revoked: 'error',
};

const IDENTITY_TYPE_KEY: Record<string, string> = {
  national_id: 'nationalId',
  passport: 'passport',
  other: 'other',
};

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * Lifecycle log of QRs the parent has issued. Active delegate QRs can be
 * revoked one-tap. Persistent parent QRs render as "always available" with no
 * expiry date — see useParentIssuedQrTokens.isFarFutureExpiry.
 */
export function ParentQrHistoryList({ parentId, children, childId }: Props) {
  const { t } = useTranslation();
  const { tokens: allTokens, isLoading, revoke, isRevoking, isFarFutureExpiry } = useParentIssuedQrTokens(parentId);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const childNames = useMemo(() => {
    const m = new Map<string, ChildLabel>();
    for (const c of children) m.set(c.id, c);
    return m;
  }, [children]);

  const tokens = useMemo(
    () => (childId ? allTokens.filter((token) => token.childId === childId) : allTokens),
    [allTokens, childId],
  );
  const counts = useMemo(() => {
    const c: Record<IssuedQrStatus, number> = { active: 0, used: 0, expired: 0, revoked: 0 };
    for (const token of tokens) c[token.status] += 1;
    return c;
  }, [tokens]);
  // Status by status (active first), newest first inside each.
  const filtered = useMemo(
    () =>
      STATUS_ORDER.flatMap((status) =>
        statusFilter === 'all' || statusFilter === status ? tokens.filter((token) => token.status === status) : [],
      ),
    [tokens, statusFilter],
  );
  const pager = usePagination(filtered, 10, `${statusFilter}|${childId ?? ''}`);
  const pageGroups = STATUS_ORDER.map((status) => ({
    status,
    items: pager.pageItems.filter((token) => token.status === status),
  })).filter((group) => group.items.length > 0);
  // Name the child on each row only when the list covers several children.
  const showChild = !childId && children.length > 1;

  const onRevoke = async (token: IssuedQrToken) => {
    const child = childNames.get(token.childId);
    if (!child) return;
    setRevokingId(token.id);
    try {
      await revoke({ tokenId: token.id, childId: token.childId, nurseryId: child.nursery_id });
      toast.success(t('qr.history.revokeOk'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('qr.history.revokeFailed'), { description: msg });
    } finally {
      setRevokingId(null);
    }
  };

  const identityLabel = (token: IssuedQrToken) => {
    const key = token.pickupIdentityType ? IDENTITY_TYPE_KEY[token.pickupIdentityType] : undefined;
    return key ? t(`qr.custom.identityTypes.${key}`) : token.pickupIdentityType ?? t('qr.custom.identityTypes.other');
  };

  return (
    <TableCard
      title={t('qr.history.title')}
      count={t('qr.history.count', { count: tokens.length })}
      filters={
        tokens.length ? (
          <FilterChips
            label={t('qr.history.title')}
            value={statusFilter}
            onChange={setStatusFilter}
            hideEmpty
            options={(['all', ...STATUS_ORDER] as const).map((value) => ({
              value,
              label: value === 'all' ? t('qr.history.all') : t(`qr.history.statuses.${value}`),
              count: value === 'all' ? tokens.length : counts[value],
            }))}
          />
        ) : null
      }
      pagination={filtered.length ? <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} /> : null}
    >
      {isLoading ? (
        <TableLoading />
      ) : !tokens.length ? (
        <TableEmpty icon="history" title={t('qr.history.emptyTitle')} description={t('qr.history.emptyDescription')} />
      ) : (
        <div>
          {pageGroups.map((group) => (
            <section key={group.status}>
              <h3 className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface-variant sm:px-5">
                <span className={cn('h-2 w-2 rounded-full', group.status === 'active' ? 'bg-success' : group.status === 'used' ? 'bg-primary' : group.status === 'revoked' ? 'bg-error' : 'bg-outline')} aria-hidden />
                {t(`qr.history.sections.${group.status}`)}
                <span className="rounded-full bg-surface-high px-1.5 tabular-nums">{counts[group.status]}</span>
              </h3>
              <ul className="divide-y divide-outline-variant">
                {group.items.map((token) => {
                  const child = childNames.get(token.childId);
                  const isDelegate = token.purpose === 'delegate';
                  const isPersistentParent = !isDelegate && isFarFutureExpiry(token.expiresAt);
                  const canRevoke = token.status === 'active' && isDelegate && Boolean(child);
                  const tone = STATUS_TONE[token.status];
                  return (
                    <li key={token.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', TONE_TINT[tone])} aria-hidden>
                          <span className="material-symbols-outlined text-xl">{isDelegate ? 'badge' : 'qr_code_2'}</span>
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 text-sm font-semibold text-on-surface">
                              {isDelegate
                                ? token.pickupPersonFullName ?? token.delegateName ?? t('qr.history.unnamedDelegate')
                                : t('qr.history.parentSelfPickup')}
                            </p>
                            <StatusPill tone={tone}>{t(`qr.history.statuses.${token.status}`)}</StatusPill>
                            <StatusPill tone="neutral" icon={isDelegate ? 'badge' : 'qr_code_2'}>
                              {isDelegate ? t('qr.childPage.tabs.custom') : t('qr.childPage.tabs.parent')}
                            </StatusPill>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                            {showChild && child ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden>child_care</span>
                                {child.displayName}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm" aria-hidden>add_circle</span>
                              {t('qr.history.issuedAt')}: {formatDateTime(token.createdAt, DATE_TIME)}
                            </span>
                            {token.consumedAt ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden>task_alt</span>
                                {t('qr.history.usedAt')}: {formatDateTime(token.consumedAt, DATE_TIME)}
                              </span>
                            ) : isPersistentParent ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm" aria-hidden>all_inclusive</span>
                                {t('qr.history.alwaysAvailable')}
                              </span>
                            ) : (
                              <span className={cn('inline-flex items-center gap-1', token.status === 'active' && 'font-medium text-warning')}>
                                <span className="material-symbols-outlined text-sm" aria-hidden>event_busy</span>
                                {t('qr.history.expiresAt')}: {formatDateTime(token.expiresAt, DATE_TIME)}
                              </span>
                            )}
                          </div>

                          {isDelegate && (token.pickupRelationship || token.pickupIdentityType || token.pickupIdentityNumber || token.pickupNotes) ? (
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              {token.pickupRelationship ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2.5 py-1 text-on-surface">
                                  <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden>family_restroom</span>
                                  {token.pickupRelationship}
                                </span>
                              ) : null}
                              {token.pickupIdentityType || token.pickupIdentityNumber ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2.5 py-1 text-on-surface">
                                  <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden>id_card</span>
                                  {identityLabel(token)}
                                  <span className="font-semibold tabular-nums" dir="ltr">{token.pickupIdentityNumber ?? '-'}</span>
                                </span>
                              ) : null}
                              {token.pickupNotes ? (
                                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-high px-2.5 py-1 text-on-surface">
                                  <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden>sticky_note_2</span>
                                  <span className="truncate">{token.pickupNotes}</span>
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {canRevoke ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 self-end border-error/40 text-error hover:bg-error/5 hover:text-error sm:self-start"
                          onClick={() => void onRevoke(token)}
                          disabled={isRevoking && revokingId === token.id}
                        >
                          <span className="material-symbols-outlined me-1 text-base" aria-hidden>block</span>
                          {t('qr.history.revoke')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </TableCard>
  );
}
