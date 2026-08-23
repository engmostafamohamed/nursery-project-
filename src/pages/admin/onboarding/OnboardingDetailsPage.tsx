import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export function OnboardingDetailsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [languagePref, setLanguagePref] = useState<NurseryLanguagePref>('both');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const showArabic = languagePref === 'ar' || languagePref === 'both';
  const showEnglish = languagePref === 'en' || languagePref === 'both';

  const onNext = async () => {
    if (!nameAr.trim() && !nameEn.trim()) {
      toast.error(t('onboarding.errors.nameRequired'));
      return;
    }

    const finalNameAr = nameAr.trim() || nameEn.trim();
    const finalNameEn = nameEn.trim() || nameAr.trim();

    if (isPreview || !user) {
      navigate(`/admin/onboarding/hours${qs}`);
      return;
    }

    setSubmitting(true);
    try {
      let logoUrl: string | null = null;

      if (logoFile) {
        const filePath = `${user.id}/${Date.now()}-${logoFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('nursery-logos')
          .upload(filePath, logoFile);

        if (!uploadError) {
          const { data } = supabase.storage.from('nursery-logos').getPublicUrl(filePath);
          logoUrl = data.publicUrl;
        }
      }

      let nurseryId = profile?.nursery_id ?? null;
      if (nurseryId) {
        const { error } = await supabase
          .from('nurseries')
          .update({
            name_ar: finalNameAr,
            name_en: finalNameEn,
            language_pref: languagePref,
            city,
            phone,
            logo_url: logoUrl,
          } as never)
          .eq('id', nurseryId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc(
          'bootstrap_nursery_for_current_user',
          {
            p_name_ar: finalNameAr,
            p_name_en: finalNameEn,
            p_language_pref: languagePref,
            p_city: city || null,
            p_phone: phone || null,
            p_logo_url: logoUrl,
          } as never,
        );
        if (error) throw error;
        nurseryId = data as unknown as string;
      }

      navigate(`/admin/onboarding/hours${qs}`);
    } catch (error) {
      toast.error(t('onboarding.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-[70vh] max-w-3xl px-4 py-8">
      <OnboardingFrame
        step={2}
        title={t('onboarding.details.title')}
        description={t('onboarding.details.subtitle')}
        backTo={`/admin/onboarding${qs}`}
        nextLabel={t('onboarding.next')}
        onNext={onNext}
        submitting={submitting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t('onboarding.details.languagePrefTitle')}</Label>
            <p className="text-xs text-on-surface-variant">
              {t('onboarding.details.languagePrefSubtitle')}
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {(['ar', 'en', 'both'] as const).map((pref) => (
                <button
                  key={pref}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    languagePref === pref
                      ? 'border-primary bg-primary text-white'
                      : 'border-outline-variant bg-surface text-foreground'
                  }`}
                  onClick={() => setLanguagePref(pref)}
                >
                  {t(`onboarding.details.languagePrefOptions.${pref}`)}
                </button>
              ))}
            </div>
          </div>
          {showArabic ? (
            <div className="space-y-2">
              <Label>{t('onboarding.details.nameAr')}</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
          ) : null}
          {showEnglish ? (
            <div className="space-y-2">
              <Label>{t('onboarding.details.nameEn')}</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
          ) : null}
          <p className="text-xs text-on-surface-variant md:col-span-2">
            {t('onboarding.nameHint')}
          </p>
          <div className="space-y-2">
            <Label>{t('onboarding.details.city')}</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('onboarding.details.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t('onboarding.details.logo')}</Label>
            <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      </OnboardingFrame>
    </div>
  );
}
