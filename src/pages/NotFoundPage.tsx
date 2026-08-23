import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-xo-navy">
        {t('errors.notFound')}
      </h1>
      <Button asChild variant="outline">
        <Link to="/">{t('errors.goBack')}</Link>
      </Button>
    </div>
  );
}
