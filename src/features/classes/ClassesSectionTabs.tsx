import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { SectionTabs, type SectionTab } from '@/components/ui/SectionTabs';
import { useAdminLinks } from '@/hooks/useAdminBasePath';
import { useCan } from '@/hooks/usePermissions';

/**
 * The Classes section's pages: the classes and their teams. Each shows only to those allowed to open
 * it; outside the admin's pages (a head of teachers opens the teams from their own menu) there are no tabs.
 */
export function ClassesSectionTabs() {
  const { t } = useTranslation();
  const links = useAdminLinks();
  const inAdmin = !useLocation().pathname.startsWith('/teacher');
  const canClasses = useCan('classes');
  const canTeams = useCan('class_team');
  if (!inAdmin) return null;

  const tabs: SectionTab[] = [
    ...(canClasses ? [{ to: links.classes, label: t('classesSection.classes'), icon: 'school', end: true }] : []),
    ...(canTeams ? [{ to: links.teams(), label: t('classesSection.teams'), icon: 'groups' }] : []),
  ];
  return <SectionTabs tabs={tabs} label={t('classesSection.label')} />;
}
