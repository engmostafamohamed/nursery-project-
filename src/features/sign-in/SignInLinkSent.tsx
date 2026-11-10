import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

/**
 * After a sign-in link was asked for. It reads the same whether the address has an account or not,
 * so the page cannot be used to find out who has one.
 */
export function SignInLinkSent({ email, onBack, onResend }: { email: string; onBack: () => void; onResend: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 text-center" data-testid="sign-in-link-sent">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
        <MaterialSymbol name="mark_email_read" size="text-4xl" />
      </span>
      <div className="space-y-2">
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('auth.page.magic.sentTitle')}</h1>
        <p className="text-sm text-on-surface-variant">
          {t('auth.page.magic.sentBody')} <b className="font-semibold text-on-surface" dir="ltr">{email}</b>
        </p>
        <p className="text-xs text-on-surface-variant">{t('auth.page.magic.sentHint')}</p>
      </div>
      <div className="space-y-2">
        <Button type="button" className="h-11 w-full btn-gradient text-primary-foreground" onClick={onBack}>
          <MaterialSymbol name="arrow_back" size="text-lg" className="me-2 rtl:rotate-180" />
          {t('auth.reset.backToSignIn')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onResend}>
          {t('auth.page.magic.otherEmail')}
        </Button>
      </div>
    </div>
  );
}
