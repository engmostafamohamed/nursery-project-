import { useTranslation } from 'react-i18next';

import { HelpAiPreferencesCard } from '@/components/settings/HelpAiPreferencesCard';

export function HelpAiPreferencesPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('helpAiPage.title')}</h1>
      <HelpAiPreferencesCard />
    </div>
  );
}
