import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DataTable, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { useLoyalty } from '@/hooks/useLoyalty';
import { usePagination } from '@/hooks/usePagination';
import { useSettings } from '@/lib/useSettings';

export function AdminLoyaltyPage() {
  const { t } = useTranslation();
  const { settings, nurseryId } = useSettings();
  const loyalty = useLoyalty({ nurseryId: nurseryId ?? undefined, enabled: Boolean(settings.loyalty_enabled) });
  const [parentId, setParentId] = useState('');
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState('');
  const pager = usePagination(loyalty.leaderboard, 10, loyalty.leaderboard.length);

  if (!settings.loyalty_enabled) {
    return <p className="text-sm text-on-surface-variant">{t('loyalty.disabledDescription')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('loyalty.adminTitle')}</h1>
        <Button asChild variant="outline"><Link to="/admin/settings">{t('loyalty.adjustThresholds')}</Link></Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('loyalty.pointsAwardedThisMonth')}</p><p className="text-lg font-bold">{loyalty.adminStats.pointsAwardedThisMonth}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('loyalty.pointsRedeemedThisMonth')}</p><p className="text-lg font-bold">{loyalty.adminStats.pointsRedeemedThisMonth}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('loyalty.avgPointsPerParent')}</p><p className="text-lg font-bold">{loyalty.adminStats.averagePointsPerParent.toFixed(1)}</p></div>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <h2 className="border-b border-outline-variant px-4 py-3 text-sm font-semibold text-on-surface">{t('loyalty.leaderboard')}</h2>
        {loyalty.leaderboard.length ? (
          <>
            <DataTable minWidth={480}>
              <THead>
                <Th className="w-16">{t('loyalty.table.rank')}</Th>
                <Th>{t('loyalty.table.parent')}</Th>
                <Th align="end">{t('loyalty.currentPoints')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((p, i) => (
                  <Tr key={p.parentId} data-testid="loyalty-leader">
                    <Td className="font-semibold tabular-nums text-on-surface-variant">{pager.startIndex + i}</Td>
                    <Td className="font-medium text-on-surface">{p.parentName}</Td>
                    <Td align="end" className="font-semibold tabular-nums text-on-surface">{p.balance}</Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
            <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
          </>
        ) : (
          <TableEmpty icon="workspace_premium" title={t('loyalty.table.emptyTitle')} />
        )}
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('loyalty.manualBonus')}</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder={t('loyalty.parentId')} value={parentId} onChange={(e) => setParentId(e.target.value)} />
          <Input type="number" min={1} value={points} onChange={(e) => setPoints(Number(e.target.value || 0))} />
          <Input placeholder={t('loyalty.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button
          className="mt-2"
          onClick={() => {
            if (!nurseryId || !parentId || points <= 0) return;
            void loyalty.awardManualBonus({ nurseryId, parentId, points, reason }).then(() => toast.success(t('loyalty.bonusAdded')));
          }}
        >
          {t('loyalty.awardPoints')}
        </Button>
      </section>

      <p className="text-xs text-on-surface-variant">{t('loyalty.expirationStub')}</p>
    </div>
  );
}
