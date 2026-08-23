import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export function UnauthorizedPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-xo-navy">
        {t('errors.unauthorized')}
      </h1>
      <Button asChild variant="default">
        <Link to="/">{t('errors.goHome')}</Link>
      </Button>
    </div>
  );
}
