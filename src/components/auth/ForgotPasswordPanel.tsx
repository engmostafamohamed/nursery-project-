import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetEmailProblem, resetErrorKey, resetRedirectUrl } from '@/lib/passwordReset';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * "Forgot password?" on the sign-in page: asks for the account's email and sends it a link to the
 * reset page. Whether an account uses that address is never said, so the page cannot be used to
 * find out who has one.
 */
export function ForgotPasswordPanel({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(initialEmail.includes('@') ? initialEmail.trim() : '');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const problem = resetEmailProblem(email);
  const shownProblem = touched ? problem : null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setRequestError(null);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const address = email.trim();
      const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: resetRedirectUrl(window.location.origin) });
      if (error) {
        setRequestError(t(`auth.reset.errors.${resetErrorKey(error)}`));
        return;
      }
      setSentTo(address);
    } finally {
      setSending(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4" data-testid="forgot-password-sent">
        <span className="material-symbols-outlined text-4xl text-primary" aria-hidden>
          mark_email_read
        </span>
        <h2 className="font-headline text-xl font-bold text-on-surface">{t('auth.reset.sentTitle')}</h2>
        <p className="text-sm text-on-surface-variant">
          {t('auth.reset.sentBody', { email: sentTo })}
        </p>
        <p className="text-xs text-on-surface-variant">{t('auth.reset.sentHint')}</p>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>
          {t('auth.reset.backToSignIn')}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate data-testid="forgot-password-form">
      <div>
        <h2 className="font-headline text-xl font-bold text-on-surface">{t('auth.reset.requestTitle')}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t('auth.reset.requestBody')}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-email">{t('auth.email')}</Label>
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute start-3 top-3 text-on-surface-variant">mail</span>
          <Input
            ref={inputRef}
            id="reset-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            autoFocus
            className={cn('ps-11', shownProblem && invalidFieldClass)}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            aria-invalid={Boolean(shownProblem)}
            aria-describedby={shownProblem ? 'reset-email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setRequestError(null);
            }}
            onBlur={() => setTouched(Boolean(email.trim()) || touched)}
          />
        </div>
        <FieldError id="reset-email-error" message={shownProblem ? t(`auth.reset.emailProblems.${shownProblem}`) : null} />
      </div>
      <Button type="submit" className="w-full btn-gradient text-primary-foreground" disabled={sending}>
        {sending ? t('common.loading') : t('auth.reset.send')}
      </Button>
      <FieldError message={requestError} className="text-sm" />
      <button type="button" className="text-sm text-secondary hover:underline" onClick={onBack}>
        {t('auth.reset.backToSignIn')}
      </button>
    </form>
  );
}
