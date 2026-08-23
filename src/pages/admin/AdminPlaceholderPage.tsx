import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function AdminPlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon="construction"
      title={t(titleKey)}
      description={t('common.comingSoon')}
    />
  );
}
