import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SettingsCategoryForm } from '@/components/admin/settings/SettingsCategoryForm';
import { NurseryProfileForm } from '@/components/admin/settings/NurseryProfileForm';
import { ParentRegistrationTemplatesEditor } from '@/components/admin/settings/ParentRegistrationTemplatesEditor';
import { TuitionPackagesEditor } from '@/components/admin/settings/TuitionPackagesEditor';
import { TenantExportCard } from '@/components/admin/settings/TenantExportCard';
import { HelpAiPreferencesCard } from '@/components/settings/HelpAiPreferencesCard';
import {
  DEFAULT_SETTINGS,
  getTabConfig,
  SETTINGS_TABS,
  type SettingsKey,
  type SettingsTabId,
} from '@/components/admin/settings/settingsConfig';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { NurserySettingsRow } from '@/types/tables/nursery_settings';

function pickTabValues(tabId: SettingsTabId, values: Partial<NurserySettingsRow>) {
  const keys = getTabConfig(tabId).fields.map((field) => field.key);
  return keys.reduce((acc, key) => ({ ...acc, [key]: values[key] }), {} as Partial<NurserySettingsRow>);
}

function isTabDirty(tabId: SettingsTabId, a: Partial<NurserySettingsRow>, b: Partial<NurserySettingsRow>) {
  return JSON.stringify(pickTabValues(tabId, a)) !== JSON.stringify(pickTabValues(tabId, b));
}

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { settings, isLoading, updateSettings, isSaving } = useNurserySettings(profile?.nursery_id);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('operations');
  const [draft, setDraft] = useState<Partial<NurserySettingsRow>>({});
  const [confirmSwitchTab, setConfirmSwitchTab] = useState<SettingsTabId | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const dirty = useMemo(() => isTabDirty(activeTab, draft, settings ?? {}), [activeTab, draft, settings]);
  const tabConfig = getTabConfig(activeTab);

  const onFieldChange = (key: keyof NurserySettingsRow, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const validateCurrentTab = () => {
    const v = draft;
    if (activeTab === 'operations' && v.standard_start_time && v.standard_end_time && String(v.standard_start_time) >= String(v.standard_end_time)) {
      return 'settings.errors.startBeforeEnd';
    }
    if (activeTab === 'communication' && v.quiet_hours_start && v.quiet_hours_end && v.quiet_hours_start === v.quiet_hours_end) {
      return 'settings.errors.quietHoursDifferent';
    }
    const percentKeys: SettingsKey[] = [
      'late_payment_fee_percentage',
      'sibling_discount_2nd_child_percentage',
      'sibling_discount_3rd_child_percentage',
      'summer_pause_charges_percentage',
    ];
    for (const key of percentKeys) {
      const raw = v[key];
      if (raw != null && raw !== '') {
        const n = Number(raw);
        if (Number.isNaN(n) || n < 0 || n > 100) return 'settings.errors.percentRange';
      }
    }
    const nonNegativeKeys: SettingsKey[] = [
      'late_pickup_fee_per_hour', 'monthly_rate', 'per_child_rate', 'hourly_rate', 'points_per_egp', 'points_redemption_rate',
    ];
    for (const key of nonNegativeKeys) {
      const raw = v[key];
      if (raw != null && raw !== '') {
        const n = Number(raw);
        if (Number.isNaN(n) || n < 0) return 'settings.errors.nonNegative';
      }
    }
    if (activeTab === 'summerPause') {
      const min = Number(v.summer_pause_min_weeks ?? 0);
      const max = Number(v.summer_pause_max_weeks ?? 0);
      if (min > max) return 'settings.errors.minLessThanMax';
    }
    if (activeTab === 'financial') {
      const model = v.pricing_model;
      if (model === 'fixed' && !v.monthly_rate) return 'settings.errors.monthlyRateRequired';
      if (model === 'per_child' && !v.per_child_rate) return 'settings.errors.perChildRateRequired';
      if (model === 'hourly' && !v.hourly_rate) return 'settings.errors.hourlyRateRequired';
    }
    return null;
  };

  const saveActiveTab = async () => {
    const errKey = validateCurrentTab();
    if (errKey) {
      toast.error(t(errKey));
      return;
    }
    try {
      await updateSettings(pickTabValues(activeTab, draft));
      toast.success(t('settings.messages.saved'));
    } catch {
      toast.error(t('settings.messages.saveError'));
    }
  };

  const onTabClick = (tabId: SettingsTabId) => {
    if (tabId === activeTab) return;
    if (dirty) {
      setConfirmSwitchTab(tabId);
      return;
    }
    setActiveTab(tabId);
  };

  const resetActiveTab = async () => {
    const keys = tabConfig.fields.map((field) => field.key);
    const resetValues = keys.reduce((acc, key) => ({ ...acc, [key]: DEFAULT_SETTINGS[key] }), {} as Partial<NurserySettingsRow>);
    const nextDraft = { ...draft, ...resetValues };
    setDraft(nextDraft);
    try {
      await updateSettings(resetValues);
      toast.success(t('settings.messages.resetDone'));
    } catch {
      toast.error(t('settings.messages.saveError'));
    } finally {
      setShowResetConfirm(false);
    }
  };

  if (isLoading || !settings) {
    return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <h1 className="px-2 text-base font-semibold text-on-surface">{t('settings.title')}</h1>
        <p className="px-2 text-xs text-on-surface-variant">{t('settings.subtitle')}</p>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`w-full rounded-lg px-3 py-2 text-start text-sm ${activeTab === tab.id ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}
            onClick={() => onTabClick(tab.id)}
          >
            {t(tab.labelKey)}
            {isTabDirty(tab.id, draft, settings) ? <span className="ms-2 text-xs">●</span> : null}
          </button>
        ))}
      </aside>

      {/* min-w-0: without it, a grid item won't shrink below its content's natural width,
          so a wide child (like the templates editor's step tabs) forces this whole column —
          and the page — wider instead of scrolling within its own container. */}
      <section className="min-w-0 space-y-3">
        {activeTab === 'profile' ? (
          profile?.nursery_id ? <NurseryProfileForm nurseryId={profile.nursery_id} /> : null
        ) : (
          <>
            {tabConfig.fields.length > 0 ? (
              <>
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <p className="text-sm font-semibold text-on-surface">{t(tabConfig.labelKey)}</p>
                  {dirty ? (
                    <p className="mt-1 text-xs text-error">{t('settings.messages.unsaved')}</p>
                  ) : null}
                </div>
                <SettingsCategoryForm
                  fields={tabConfig.fields}
                  values={draft}
                  t={t}
                  onChange={onFieldChange}
                  onSave={saveActiveTab}
                  onReset={() => setShowResetConfirm(true)}
                  isSaving={isSaving}
                />
              </>
            ) : null}
            {activeTab === 'admissions' ? (
              <ParentRegistrationTemplatesEditor nurseryId={profile?.nursery_id} />
            ) : null}
            {activeTab === 'financial' ? (
              <TuitionPackagesEditor nurseryId={profile?.nursery_id} />
            ) : null}
          </>
        )}
      </section>

      <Dialog open={Boolean(confirmSwitchTab)} onOpenChange={(open) => !open && setConfirmSwitchTab(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.unsavedDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.unsavedDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSwitchTab(null)}>{t('settings.unsavedDialog.stay')}</Button>
            <Button
              onClick={() => {
                if (confirmSwitchTab) setActiveTab(confirmSwitchTab);
                setConfirmSwitchTab(null);
              }}
            >
              {t('settings.unsavedDialog.discard')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.resetDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.resetDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>{t('settings.resetDialog.cancel')}</Button>
            <Button onClick={() => void resetActiveTab()}>{t('settings.resetDialog.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    <TenantExportCard enabled={Boolean(profile?.nursery_id)} />
    <HelpAiPreferencesCard />
    </div>
  );
}
