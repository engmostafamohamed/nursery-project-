import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { newTakingKey } from './kitchenLook';
import type { ExtraRequest } from './kitchenSales';
import { cancelChildExtra, errorDetail, kitchenErrorKey, serveChildExtra } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

/**
 * What staff can do with today's extra request: serve it once approved (it is then charged), or
 * cancel it while it waits or before it is served.
 */
export function ExtraActions({ request, childName }: { request: Pick<ExtraRequest, 'id' | 'status' | 'itemName'>; childName: string }) {
  const { t } = useTranslation();
  const key = useRef(newTakingKey());
  const serve = useKitchenSale(() => serveChildExtra(request.id, key.current));
  const cancel = useKitchenSale(() => cancelChildExtra(request.id));

  const doServe = async () => {
    try {
      await serve.mutateAsync(undefined);
      toast.success(t('kitchenSales.extras.served', { item: request.itemName, child: childName }));
    } catch (error) {
      toast.error(t(kitchenErrorKey(error), { quantity: errorDetail(error) }));
      key.current = newTakingKey();
    }
  };
  const doCancel = async () => {
    const ok = await confirm({
      title: t('kitchenSales.extras.cancelTitle'),
      description: t('kitchenSales.extras.cancelBody', { item: request.itemName, child: childName }),
      confirmText: t('kitchenSales.extras.cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(undefined);
      toast.success(t('kitchenSales.extras.cancelled'));
    } catch (error) {
      toast.error(t(kitchenErrorKey(error)));
    }
  };

  if (request.status !== 'approved' && request.status !== 'waiting_parent') return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {request.status === 'approved' ? (
        <Button type="button" size="sm" onClick={() => void doServe()} disabled={serve.isPending} data-testid="serve-extra">
          <MaterialSymbol name="restaurant" size="text-base" className="me-1" />
          {t('kitchenSales.extras.serve')}
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => void doCancel()} disabled={cancel.isPending}>
        {t('kitchenSales.extras.cancel')}
      </Button>
    </span>
  );
}
