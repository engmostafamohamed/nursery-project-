import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

const weekDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function OnboardingHoursPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('16:00');
  const [days, setDays] = useState<string[]>(['sun', 'mon', 'tue', 'wed', 'thu']);
  const [submitting, setSubmitting] = useState(false);

  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const toggleDay = (day: string) => {
    setDays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  };

  const onNext = async () => {
    if (isPreview || !profile?.nursery_id) {
      navigate(`/admin/onboarding/class${qs}`);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('nurseries')
        .update({ opens_at: opensAt, closes_at: closesAt, working_days: days } as never)
        .eq('id', profile.nursery_id);
      if (error) throw error;
      navigate(`/admin/onboarding/class${qs}`);
    } catch {
      toast.error(t('onboarding.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-[70vh] max-w-3xl px-4 py-8">
      <OnboardingFrame
        step={3}
        title={t('onboarding.hours.title')}
        description={t('onboarding.hours.subtitle')}
        backTo={`/admin/onboarding/details${qs}`}
        skipTo={`/admin/onboarding/class${qs}`}
        nextLabel={t('onboarding.next')}
        onNext={onNext}
        submitting={submitting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('onboarding.hours.opensAt')}</Label>
            <Input type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('onboarding.hours.closesAt')}</Label>
            <Input type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('onboarding.hours.days')}</Label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {weekDays.map((day) => (
              <button
                key={day}
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${days.includes(day) ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-surface text-foreground'}`}
                onClick={() => toggleDay(day)}
              >
                {t(`onboarding.weekDays.${day}`)}
              </button>
            ))}
          </div>
        </div>
      </OnboardingFrame>
    </div>
  );
}
