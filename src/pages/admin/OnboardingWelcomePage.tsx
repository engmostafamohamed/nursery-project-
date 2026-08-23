import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export function OnboardingWelcomePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4 py-8">
      <div className="w-full rounded-3xl bg-surface-container-lowest p-8 text-center shadow-sm md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-on-primary">
          XO
        </div>
        <h1 className="font-headline text-3xl font-extrabold text-on-surface">
          {t('onboarding.welcome.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-on-surface-variant">
          {t('onboarding.welcome.subtitle')}
        </p>

        <Button asChild className="mt-8 min-w-40">
          <Link to={`/admin/onboarding/details${isPreview ? '?preview=true' : ''}`}>
            {t('onboarding.welcome.start')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
