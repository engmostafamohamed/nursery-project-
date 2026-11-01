import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { StaffSignIn } from './submitStaffOnboarding';

/**
 * A new staff member's sign-in address and first password, right after onboarding. The password is
 * shown here once and never again; the staff member replaces it at their first sign-in.
 */
export function StaffSignInDetailsDialog({ signIn, onDone }: { signIn: StaffSignIn | null; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  const copy = async (what: 'email' | 'password' | 'both') => {
    if (!signIn) return;
    const text =
      what === 'email'
        ? signIn.email
        : what === 'password'
          ? signIn.tempPassword
          : `${t('staffOnboarding.signIn.email')}: ${signIn.email}\n${t('staffOnboarding.signIn.password')}: ${signIn.tempPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Dialog open={Boolean(signIn)} onOpenChange={(open) => (open ? undefined : onDone())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staffOnboarding.signIn.title')}</DialogTitle>
          <DialogDescription>{t('staffOnboarding.signIn.description')}</DialogDescription>
        </DialogHeader>
        {signIn ? (
          <dl className="space-y-3">
            {(
              [
                ['email', signIn.email],
                ['password', signIn.tempPassword],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
                <dt className="text-xs text-on-surface-variant">{t(`staffOnboarding.signIn.${key}`)}</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <span dir="ltr" className="break-all font-mono text-sm font-semibold text-on-surface" data-testid={`staff-sign-in-${key}`}>
                    {value}
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void copy(key)} aria-label={t(`staffOnboarding.signIn.copy_${key}`)}>
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      {copied === key ? 'check' : 'content_copy'}
                    </span>
                  </Button>
                </dd>
              </div>
            ))}
            <p className="rounded-xl bg-warning/10 p-3 text-xs text-on-surface">{t('staffOnboarding.signIn.onlyOnce')}</p>
          </dl>
        ) : null}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => void copy('both')}>
            {copied === 'both' ? t('staffOnboarding.signIn.copied') : t('staffOnboarding.signIn.copyBoth')}
          </Button>
          <Button type="button" onClick={onDone}>
            {t('staffOnboarding.signIn.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
