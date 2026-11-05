import { useTranslation } from 'react-i18next';

import { HelpAiPreferencesCard } from '@/components/settings/HelpAiPreferencesCard';
import { PushNotificationsCard } from '@/components/settings/PushNotificationsCard';

/** The teacher's and the parent's own settings. */
export function PreferencesPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('preferencesPage.title')}</h1>
      <PushNotificationsCard />
      <HelpAiPreferencesCard />
    </div>
  );
}
