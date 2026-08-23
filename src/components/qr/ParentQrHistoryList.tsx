import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useParentIssuedQrTokens,
  type IssuedQrStatus,
  type IssuedQrToken,
} from '@/hooks/useParentIssuedQrTokens';

type ChildLabel = { id: string; nursery_id: string; displayName: string };

type Props = {
  parentId: string | undefined;
  /** Used to render child names + pass nursery_id to the revoke call. */
  children: ChildLabel[];
};

const STATUS_BADGE_CLASS: Record<IssuedQrStatus, string> = {
  active: 'border-success bg-success/10 text-success',
  used: 'border-outline-variant text-on-surface-variant',
  expired: 'border-outline-variant text-on-surface-variant',
  revoked: 'border-outline-variant text-on-surface-variant',
};

const STATUS_ORDER: IssuedQrStatus[] = ['active', 'used', 'expired', 'revoked'];

/**
 * Lifecycle log of QRs the parent has issued. Active delegate QRs can be
 * revoked one-tap. Persistent parent QRs render as "always available" with no
 * expiry date — see useParentIssuedQrTokens.isFarFutureExpiry.
 */
export function ParentQrHistoryList({ parentId, children }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const { groupedByStatus, isLoading, revoke, isRevoking, isFarFutureExpiry } =
    useParentIssuedQrTokens(parentId);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const childNames = useMemo(() => {
    const m = new Map<string, ChildLabel>();
    for (const c of children) m.set(c.id, c);
    return m;
  }, [children]);

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

  if (isLoading) {
    return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  }

  const total = STATUS_ORDER.reduce((n, s) => n + groupedByStatus[s].length, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon="history"
        title={t('qr.history.emptyTitle')}
        description={t('qr.history.emptyDescription')}
      />
    );
  }

  const formatDateTime = (iso: string) => new Date(iso).toLocaleString(locale);

  return (
    <div className="space-y-6">
      {STATUS_ORDER.map((status) => {
        const list = groupedByStatus[status];
        if (!list.length) return null;
        return (
          <section key={status} className="space-y-2">
            <h3 className="text-sm font-semibold text-on-surface">
              {t(`qr.history.sections.${status}`)} ({list.length})
            </h3>
            <ul className="space-y-2">
              {list.map((token) => {
                const child = childNames.get(token.childId);
                const isPersistentParent = token.purpose === 'parent' && isFarFutureExpiry(token.expiresAt);
                const canRevoke = token.status === 'active' && token.purpose === 'delegate';
                return (
                  <li
                    key={token.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">
                          {token.purpose === 'delegate'
                            ? token.delegateName ?? t('qr.history.unnamedDelegate')
                            : t('qr.history.parentSelfPickup')}
                        </p>
                        <Badge className={`text-[10px] ${STATUS_BADGE_CLASS[token.status]}`}>
                          {t(`qr.history.statuses.${token.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        {child ? `${t('qr.history.forChild')}: ${child.displayName} · ` : ''}
                        {t('qr.history.issuedAt')}: {formatDateTime(token.createdAt)}
                      </p>
                      {token.consumedAt ? (
                        <p className="text-xs text-on-surface-variant">
                          {t('qr.history.usedAt')}: {formatDateTime(token.consumedAt)}
                        </p>
                      ) : isPersistentParent ? (
                        <p className="text-xs text-on-surface-variant">
                          {t('qr.history.alwaysAvailable')}
                        </p>
                      ) : (
                        <p className="text-xs text-on-surface-variant">
                          {t('qr.history.expiresAt')}: {formatDateTime(token.expiresAt)}
                        </p>
                      )}
                    </div>
                    {canRevoke ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onRevoke(token)}
                        disabled={isRevoking && revokingId === token.id}
                      >
                        {t('qr.history.revoke')}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
