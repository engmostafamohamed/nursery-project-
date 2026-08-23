import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function TeacherPlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon="school"
      title={t(titleKey)}
      description={t('common.comingSoon')}
    />
  );
}
