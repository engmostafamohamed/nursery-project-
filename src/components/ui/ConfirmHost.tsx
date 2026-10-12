import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { settleConfirm, useConfirmState } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

/** Renders the dialog for `confirm()`. Mount once near the app root (alongside the toaster). */
export function ConfirmHost() {
  const { t } = useTranslation();
  const snap = useConfirmState();
  const { opts } = snap;
  const danger = opts.variant === 'danger';
  const icon = opts.icon ?? (danger ? 'warning' : 'help');

  return (
    <Dialog
      open={snap.open}
      onOpenChange={(o) => {
        if (!o) settleConfirm(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              danger ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
            }`}
          >
            <MaterialSymbol name={icon} size="text-3xl" />
          </span>
          <DialogHeader className="items-center text-center">
            <DialogTitle>{opts.title ?? t('common.areYouSure')}</DialogTitle>
            {opts.description ? (
              <DialogDescription className="text-center">{opts.description}</DialogDescription>
            ) : null}
          </DialogHeader>
        </div>
        <DialogFooter className="mt-2 sm:justify-center">
          <Button variant="secondary" onClick={() => settleConfirm(false)}>
            {opts.cancelText ?? t('common.cancel')}
          </Button>
          <Button variant={danger ? 'destructive' : 'default'} onClick={() => settleConfirm(true)}>
            {opts.confirmText ?? (danger ? t('common.delete') : t('common.confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
