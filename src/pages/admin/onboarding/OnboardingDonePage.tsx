import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';

export function OnboardingDonePage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);

  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';

  const completeOnboarding = async () => {
    if (isPreview || !user) return;
    setSubmitting(true);
    await supabase.from('users').update({ onboarding_completed: true } as never).eq('id', user.id);
    setSubmitting(false);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 py-8">
      <div className="w-full rounded-3xl bg-surface-container-lowest p-8 text-center shadow-sm md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-on-primary">
          XO
        </div>
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">{t('onboarding.done.title')}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-on-surface-variant">{t('onboarding.done.subtitle')}</p>
        <Button asChild className="mt-8 min-w-44" onClick={() => void completeOnboarding()} disabled={submitting}>
          <Link to="/admin">{t('onboarding.done.goDashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}
