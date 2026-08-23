import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

export function SignupSuccessPage() {
  const { t } = useTranslation();

  useEffect(() => {
    // Best-effort confetti-adjacent nudge via document title
    const prev = document.title;
    document.title = `${t('signup.success.title')} — XO`;
    return () => {
      document.title = prev;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-end px-4 py-4 lg:px-8">
        <LanguageToggle />
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-8 text-center sm:py-16">
        <div className="relative mb-8">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <MaterialSymbol name="check" className="text-5xl" />
          </div>
        </div>

        <h1 className="mb-3 font-headline text-3xl font-extrabold text-on-surface sm:text-4xl">
          {t('signup.success.title')}
        </h1>
        <p className="mb-8 max-w-lg text-base text-on-surface-variant">
          {t('signup.success.description')}
        </p>

        <div className="w-full space-y-3 rounded-3xl bg-surface-container-lowest p-6 text-start shadow-sm sm:p-8">
          <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
            {t('signup.success.whatsNextTitle')}
          </h2>

          {[
            { icon: 'fact_check', textKey: 'signup.success.step1' },
            { icon: 'mark_email_read', textKey: 'signup.success.step2' },
            { icon: 'celebration', textKey: 'signup.success.step3' },
          ].map((item, i) => (
            <div key={item.icon} className="flex items-start gap-4 rounded-2xl bg-surface-container px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MaterialSymbol name={item.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t('signup.success.stepLabel', { num: i + 1 })}
                </p>
                <p className="text-sm text-on-surface">{t(item.textKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" size="lg">
            <Link to="/login">{t('signup.success.backToLogin')}</Link>
          </Button>
          <Button asChild size="lg" className="btn-gradient text-primary-foreground">
            <Link to="/">{t('signup.success.backToHome')}</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-on-surface-variant">{t('signup.success.contactNote')}</p>
      </main>
    </div>
  );
}
