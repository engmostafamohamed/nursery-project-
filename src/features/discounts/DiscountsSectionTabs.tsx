import { useTranslation } from 'react-i18next';

import { SectionTabs } from '@/components/ui/SectionTabs';
import { useAdminLinks } from '@/hooks/useAdminBasePath';

/** The Discounts section's pages: the deals on packages, and the partners (companies, schools, organizations). */
export function DiscountsSectionTabs() {
  const { t } = useTranslation();
  const links = useAdminLinks();
  return (
    <SectionTabs
      label={t('discounts.section.label')}
      tabs={[
        { to: links.deals, label: t('discounts.section.deals'), icon: 'sell', end: true },
        { to: links.partnerships, label: t('discounts.section.partnerships'), icon: 'handshake' },
      ]}
    />
  );
}
