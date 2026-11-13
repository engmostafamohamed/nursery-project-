import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { CancelEventDialog } from './CancelEventDialog';

/**
 * On a family's own urgent event: it needs no answer; the nursery and the children's teachers
 * were told. While it is still to come the family can take it back, with a reason they read.
 */
export function FamilyEventNotice({ eventId, eventTitle, childNames, canCancel, onCancelled }: {
  eventId: string;
  eventTitle: string;
  childNames: string;
  canCancel: boolean;
  onCancelled: () => void;
}) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="family-event-notice">
      <p className="flex items-start gap-2 text-sm text-on-surface">
        <MaterialSymbol name="campaign" size="text-lg" className="shrink-0 text-primary" />
        <span>
          <span className="block font-semibold">{t('familyEvent.yours')}</span>
          <span className="block text-xs text-on-surface-variant">{t('familyEvent.yoursHint', { names: childNames })}</span>
        </span>
      </p>
      {canCancel ? (
        <Button type="button" variant="outline" className="shrink-0 border-error/40 text-error hover:bg-error/10" onClick={() => setCancelling(true)} data-testid="family-event-cancel">
          <MaterialSymbol name="event_busy" size="text-base" className="me-1" />
          {t('familyEvent.cancel')}
        </Button>
      ) : null}
      {cancelling ? (
        <CancelEventDialog
          forFamily
          eventId={eventId}
          eventTitle={eventTitle}
          onClose={() => setCancelling(false)}
          onCancelled={() => {
            setCancelling(false);
            onCancelled();
          }}
        />
      ) : null}
    </section>
  );
}
