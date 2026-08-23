import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export function OnboardingClassPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [capacity, setCapacity] = useState('20');
  const [submitting, setSubmitting] = useState(false);

  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const showArabic = languagePref === 'ar' || languagePref === 'both';
  const showEnglish = languagePref === 'en' || languagePref === 'both';

  const onNext = async () => {
    if (isPreview || !profile?.nursery_id) {
      navigate(`/admin/onboarding/invite${qs}`);
      return;
    }
    if (!nameAr.trim() && !nameEn.trim()) {
      toast.error(t('onboarding.errors.classRequired'));
      return;
    }
    const finalNameAr = nameAr.trim() || nameEn.trim();
    const finalNameEn = nameEn.trim() || nameAr.trim();

    setSubmitting(true);
    try {
      const { error } = await supabase.from('classes').insert({
        nursery_id: profile.nursery_id,
        name_ar: finalNameAr,
        name_en: finalNameEn,
        grade_level: ageGroup || null,
        capacity: Number(capacity) || null,
      } as never);
      if (error) throw error;
      navigate(`/admin/onboarding/invite${qs}`);
    } catch {
      toast.error(t('onboarding.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-[70vh] max-w-3xl px-4 py-8">
      <OnboardingFrame
        step={4}
        title={t('onboarding.class.title')}
        description={t('onboarding.class.subtitle')}
        backTo={`/admin/onboarding/hours${qs}`}
        skipTo={`/admin/onboarding/invite${qs}`}
        nextLabel={t('onboarding.next')}
        onNext={onNext}
        submitting={submitting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {showArabic ? (
            <div className="space-y-2">
              <Label>{t('onboarding.class.nameAr')}</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
          ) : null}
          {showEnglish ? (
            <div className="space-y-2">
              <Label>{t('onboarding.class.nameEn')}</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
          ) : null}
          <p className="text-xs text-on-surface-variant md:col-span-2">
            {t('onboarding.nameHint')}
          </p>
          <div className="space-y-2">
            <Label>{t('onboarding.class.ageGroup')}</Label>
            <Input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('onboarding.class.capacity')}</Label>
            <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
        </div>
      </OnboardingFrame>
    </div>
  );
}
