import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/ui/EmptyState';

export function AdminInvoiceStubPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="receipt_long"
      title={t('admin.events.invoices.invoiceDetailsTitle')}
      description={t('common.comingSoon')}
    />
  );
}
