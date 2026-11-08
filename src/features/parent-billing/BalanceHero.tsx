import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import type { BillingSummary } from './parentBilling';

/**
 * The top of the parent's bills: what they owe now, when the next payment is due, what is waiting
 * for the nursery, and one button to pay the invoice that matters most (the oldest overdue one, or
 * else the one due soonest).
 */
export function BalanceHero({ summary, onPay }: { summary: BillingSummary; onPay: (invoiceId: string) => void }) {
  const { t } = useTranslation();
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const late = summary.overdueCount > 0;
  const owes = summary.owed > 0;

  return (
    <section
      aria-labelledby="balance-hero-title"
      className={cn(
        'overflow-hidden rounded-xl border bg-surface shadow-sm',
        late ? 'border-error/40' : owes ? 'border-outline-variant' : 'border-success/40',
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p id="balance-hero-title" className="text-sm font-medium text-on-surface-variant">
            {owes ? t('parentBilling.hero.owe') : t('parentBilling.hero.nothingToPay')}
          </p>
          <p className="mt-1 text-3xl font-bold text-on-surface" data-testid="balance-owed">
            {owes ? money(summary.owed) : t('parentBilling.hero.allClear')}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {late ? (
              <li className="flex items-center gap-1.5 font-medium text-error">
                <MaterialSymbol name="error" size="text-base" />
                {t('parentBilling.hero.overdue', { count: summary.overdueCount, amount: money(summary.overdue) })}
              </li>
            ) : summary.next ? (
              <li className="flex items-center gap-1.5 text-on-surface-variant">
                <MaterialSymbol name="event" size="text-base" />
                {t('parentBilling.hero.nextDue', { date: formatDate(summary.next.dueDate), amount: money(summary.next.payable) })}
              </li>
            ) : null}
            {summary.inReview > 0 ? (
              <li className="flex items-center gap-1.5 text-warning">
                <MaterialSymbol name="hourglass_top" size="text-base" />
                {t('parentBilling.hero.inReview', { amount: money(summary.inReview) })}
              </li>
            ) : null}
          </ul>
        </div>
        {summary.next ? (
          <Button
            type="button"
            size="lg"
            variant={late ? 'destructive' : 'default'}
            className="w-full gap-2 sm:w-auto"
            onClick={() => onPay(summary.next!.id)}
          >
            <MaterialSymbol name="payments" size="text-lg" />
            {late ? t('parentBilling.hero.payOverdue') : t('parentBilling.hero.payNext')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
