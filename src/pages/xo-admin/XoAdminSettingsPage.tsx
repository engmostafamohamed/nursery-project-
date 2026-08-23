import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AdminNurseryPicker } from '@/components/admin/AdminNurseryPicker';
import { TenantExportCard } from '@/components/admin/settings/TenantExportCard';
import { HelpAiPreferencesCard } from '@/components/settings/HelpAiPreferencesCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';

type SettingsLink = {
  to: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
};

const PLATFORM_LINKS: SettingsLink[] = [
  {
    to: '/xo-admin/nurseries',
    icon: 'apartment',
    titleKey: 'xoAdmin.settingsPage.nurseryPortfolioTitle',
    descriptionKey: 'xoAdmin.settingsPage.nurseryPortfolioDescription',
  },
  {
    to: '/xo-admin/payments',
    icon: 'payments',
    titleKey: 'xoAdmin.settingsPage.paymentsTitle',
    descriptionKey: 'xoAdmin.settingsPage.paymentsDescription',
  },
  {
    to: '/xo-admin/analytics',
    icon: 'monitoring',
    titleKey: 'xoAdmin.settingsPage.analyticsTitle',
    descriptionKey: 'xoAdmin.settingsPage.analyticsDescription',
  },
];

const ACCESS_LINKS: SettingsLink[] = [
  {
    to: '/xo-admin/nursery/settings/positions',
    icon: 'work',
    titleKey: 'xoAdmin.settingsPage.positionsTitle',
    descriptionKey: 'xoAdmin.settingsPage.positionsDescription',
  },
  {
    to: '/xo-admin/nursery/settings/roles',
    icon: 'shield_person',
    titleKey: 'xoAdmin.settingsPage.rolesTitle',
    descriptionKey: 'xoAdmin.settingsPage.rolesDescription',
  },
  {
    to: '/xo-admin/nursery/settings/features',
    icon: 'extension',
    titleKey: 'xoAdmin.settingsPage.featuresTitle',
    descriptionKey: 'xoAdmin.settingsPage.featuresDescription',
  },
];

function SettingsLinkCard({ item }: { item: SettingsLink }) {
  const { t } = useTranslation();

  return (
    <Link
      to={item.to}
      className="group flex min-h-28 items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-on-surface transition-colors hover:border-primary hover:bg-primary-container/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <span className="material-symbols-outlined text-xl" aria-hidden>
          {item.icon}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{t(item.titleKey)}</span>
        <span className="mt-1 block text-xs leading-5 text-on-surface-variant">
          {t(item.descriptionKey)}
        </span>
      </span>
    </Link>
  );
}

export function XoAdminSettingsPage() {
  const { t } = useTranslation();
  const { activeNurseryId } = useActiveNurseryId();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">
          {t('xoAdmin.settingsPage.title')}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t('xoAdmin.settingsPage.subtitle')}
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <Card className="border border-outline-variant bg-surface-container-lowest">
          <CardHeader>
            <CardTitle>{t('xoAdmin.settingsPage.selectedNurseryTitle')}</CardTitle>
            <CardDescription>{t('xoAdmin.settingsPage.selectedNurseryDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AdminNurseryPicker />
            <div className="flex flex-wrap gap-2">
              {activeNurseryId ? (
                <>
                  <Button asChild>
                    <Link to="/xo-admin/nursery/settings">
                      {t('xoAdmin.settingsPage.openNurserySettings')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/xo-admin/nursery">
                      {t('xoAdmin.nurseryList.openDashboard')}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" disabled>
                    {t('xoAdmin.settingsPage.openNurserySettings')}
                  </Button>
                  <Button type="button" variant="outline" disabled>
                    {t('xoAdmin.nurseryList.openDashboard')}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <HelpAiPreferencesCard />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            {t('xoAdmin.settingsPage.platformSectionTitle')}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('xoAdmin.settingsPage.platformSectionDescription')}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PLATFORM_LINKS.map((item) => (
            <SettingsLinkCard key={item.to} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            {t('xoAdmin.settingsPage.accessSectionTitle')}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('xoAdmin.settingsPage.accessSectionDescription')}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {ACCESS_LINKS.map((item) => (
            <SettingsLinkCard key={item.to} item={item} />
          ))}
        </div>
      </section>

      <TenantExportCard enabled={Boolean(activeNurseryId)} />
    </div>
  );
}
