import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { billApprovedChildren, eventFlowErrorKey } from './eventFlowApi';

/**
 * A paid event's families who said yes but have no invoice (answers from before billing worked, or
 * a billing that failed): how many, and the step that bills each of them once.
 */
export function UnbilledApprovalsNotice({ eventId, count, onBilled }: { eventId: string; count: number; onBilled: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (count <= 0) return null;

  const bill = async () => {
    setBusy(true);
    try {
      const billed = await billApprovedChildren(eventId);
      toast.success(t('eventFlow.bill.done', { count: billed }));
      onBilled();
    } catch (error) {
      toast.error(t('eventFlow.bill.failed'), { description: t(eventFlowErrorKey(error)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="unbilled-approvals">
      <p className="flex items-start gap-2 text-sm text-on-surface">
        <MaterialSymbol name="receipt_long" size="text-lg" className="shrink-0 text-warning" />
        <span>
          <span className="block font-semibold">{t('eventFlow.bill.title', { count })}</span>
          <span className="block text-xs text-on-surface-variant">{t('eventFlow.bill.hint')}</span>
        </span>
      </p>
      <Button type="button" className="shrink-0" disabled={busy} onClick={() => void bill()}>
        <MaterialSymbol name="request_quote" size="text-base" className="me-1" />
        {t('eventFlow.bill.action', { count })}
      </Button>
    </section>
  );
}
