import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function ParentInvoiceStubPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="receipt_long"
      title={t('parent.events.invoiceDetailsTitle')}
      description={t('common.comingSoon')}
    />
  );
}
