import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function AdminEventDetailsStubPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="event_note"
      title={t('admin.events.actions.viewDetails')}
      description={t('common.comingSoon')}
    />
  );
}
