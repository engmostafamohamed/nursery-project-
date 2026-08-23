import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function ParentPlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon="routine"
      title={t(titleKey)}
      description={t('common.comingSoon')}
    />
  );
}
