import { useSyncExternalStore } from 'react';

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

/** Answers the open prompt; used by <ConfirmHost />. */
export function settleConfirm(result: boolean) {
  state.resolve?.(result);
  state = { open: false, opts: state.opts, resolve: null };
  emit();
}

/** The prompt <ConfirmHost /> should show. */
export function useConfirmState() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
