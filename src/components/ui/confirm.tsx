import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  /** Bold heading. Defaults to a translated "Are you sure?". */
  title?: string;
  /** Body text / the question being asked. */
  description?: string;
  /** Confirm button label. Defaults to translated "Confirm" (or "Delete" for danger). */
  confirmText?: string;
  /** Cancel button label. Defaults to translated "Cancel". */
  cancelText?: string;
  /** 'danger' shows a red icon + destructive confirm button. */
  variant?: ConfirmVariant;
  /** Material symbol name overriding the default icon. */
  icon?: string;
}

interface ConfirmState {
  open: boolean;
  opts: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}

let state: ConfirmState = { open: false, opts: {}, resolve: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() {
  return state;
}

/**
 * SweetAlert-style confirmation. Returns a promise that resolves to `true` when
 * the user confirms and `false` when they cancel / dismiss.
 *
 *   if (!(await confirm({ description: t('...'), variant: 'danger' }))) return;
 *
 * A single <ConfirmHost /> mounted at the app root renders the dialog.
 */
export function confirm(input: string | ConfirmOptions): Promise<boolean> {
  const opts = typeof input === 'string' ? { description: input } : input;
  // If a previous prompt is still open, treat it as cancelled.
  state.resolve?.(false);
  return new Promise<boolean>((resolve) => {
    state = { open: true, opts, resolve };
    emit();
  });
}

function settle(result: boolean) {
  state.resolve?.(result);
  state = { open: false, opts: state.opts, resolve: null };
  emit();
}

/** Mount once near the app root (alongside the toaster). */
export function ConfirmHost() {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  const { opts } = snap;
  const danger = opts.variant === 'danger';
  const icon = opts.icon ?? (danger ? 'warning' : 'help');

  return (
    <Dialog
      open={snap.open}
      onOpenChange={(o) => {
        if (!o) settle(false);
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
          <Button variant="secondary" onClick={() => settle(false)}>
            {opts.cancelText ?? t('common.cancel')}
          </Button>
          <Button variant={danger ? 'destructive' : 'default'} onClick={() => settle(true)}>
            {opts.confirmText ?? (danger ? t('common.delete') : t('common.confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
