import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import {
  PARENT_TEXT_MAX_LENGTH,
  parentPackageTextsFromSettings,
  type ParentPackageTexts,
} from '@/lib/parentPackageTexts';
import { supabase } from '@/lib/supabase';
import { formatQueryError } from '@/lib/utils';

type TextKey = keyof ParentPackageTexts;
type Lang = 'ar' | 'en';

/** Which texts each Packages tab edits, and the standard text parents see when one is empty. */
const SECTION_FIELDS: Record<'tuition' | 'extraHours', Array<{ key: TextKey; standardKey: string }>> = {
  tuition: [
    { key: 'paymentIntro', standardKey: 'signup.payment.description' },
    { key: 'tuitionIntro', standardKey: 'signup.payment.chooseTuitionHint' },
  ],
  extraHours: [{ key: 'extraHoursIntro', standardKey: 'signup.payment.extraHoursHint' }],
};

/**
 * The nursery's own words above the packages parents choose from, in Arabic and English. A box
 * left empty shows the standard text (its placeholder), so the admin sees what parents will read.
 */
export function PackageSectionTextsCard({
  nurseryId,
  section,
}: {
  nurseryId: string | null | undefined;
  section: 'tuition' | 'extraHours';
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { settings } = useNurserySettings(nurseryId);
  const saved = parentPackageTextsFromSettings(settings as Record<string, unknown> | null | undefined);
  const [draft, setDraft] = useState<ParentPackageTexts | null>(null);
  const [saving, setSaving] = useState(false);
  const fields = SECTION_FIELDS[section];
  const current = draft ?? saved;
  const usesOwnText = fields.some(({ key }) => saved[key].ar || saved[key].en);

  const setText = (key: TextKey, lang: Lang, value: string) =>
    setDraft((prev) => {
      const base = prev ?? saved;
      return { ...base, [key]: { ...base[key], [lang]: value } };
    });

  const save = async () => {
    if (!nurseryId || !draft) return;
    setSaving(true);
    // All six are saved together; the other tab's texts are sent back as they are.
    const { error } = await supabase.rpc('set_parent_package_texts' as never, {
      p_nursery_id: nurseryId,
      p_payment_intro_ar: draft.paymentIntro.ar,
      p_payment_intro_en: draft.paymentIntro.en,
      p_tuition_intro_ar: draft.tuitionIntro.ar,
      p_tuition_intro_en: draft.tuitionIntro.en,
      p_extra_hours_intro_ar: draft.extraHoursIntro.ar,
      p_extra_hours_intro_en: draft.extraHoursIntro.en,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(t('packageTexts.saveFailed'), { description: formatQueryError(error) });
      return;
    }
    toast.success(t('packageTexts.saved'));
    setDraft(null);
    void queryClient.invalidateQueries({ queryKey: ['nursery-settings', nurseryId] });
  };

  if (!nurseryId) return null;
  const open = draft !== null;

  return (
    <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name="edit_note" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-on-surface">{t('packageTexts.title')}</h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-on-surface-variant">{t('packageTexts.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={usesOwnText ? 'success' : 'neutral'}>
            {usesOwnText ? t('packageTexts.custom') : t('packageTexts.standard')}
          </StatusPill>
          {open ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(saved)}>
              <MaterialSymbol name="edit" size="text-base" />
              {t('packageTexts.edit')}
            </Button>
          )}
        </div>
      </div>

      {open ? (
        <div className="space-y-3">
          {fields.map(({ key, standardKey }) => (
            <div key={key} className="space-y-2 rounded-lg border border-outline-variant p-3">
              <p className="text-sm font-medium text-on-surface">{t(`packageTexts.fields.${key}`)}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['ar', 'en'] as const).map((lang) => {
                  const id = `parent-text-${key}-${lang}`;
                  const value = current[key][lang] ?? '';
                  return (
                    <div key={lang} className="space-y-1">
                      <Label htmlFor={id}>{t(lang === 'ar' ? 'packageTexts.arabic' : 'packageTexts.english')}</Label>
                      <Textarea
                        id={id}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        rows={3}
                        maxLength={PARENT_TEXT_MAX_LENGTH}
                        // The standard text: clearly faded, so it does not read as text already saved.
                        className="placeholder:italic placeholder:opacity-50"
                        value={value}
                        placeholder={i18n.getFixedT(lang)(standardKey)}
                        onChange={(e) => setText(key, lang, e.target.value)}
                      />
                      <p className="text-end text-[11px] tabular-nums text-on-surface-variant">
                        {t('packageTexts.counter', { count: value.length, max: PARENT_TEXT_MAX_LENGTH })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? t('common.saving') : t('packageTexts.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
