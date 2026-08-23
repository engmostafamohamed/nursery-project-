import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

export function OnboardingInviteTeacherPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const onNext = async () => {
    if (!email) {
      navigate(`/admin/onboarding/done${qs}`);
      return;
    }
    setSubmitting(true);
    try {
      if (!isPreview) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) throw error;
      }
      toast.success(t('onboarding.invite.sent'));
      navigate(`/admin/onboarding/done${qs}`);
    } catch {
      toast.error(t('onboarding.errors.inviteFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-[70vh] max-w-3xl px-4 py-8">
      <OnboardingFrame
        step={5}
        title={t('onboarding.invite.title')}
        description={t('onboarding.invite.subtitle')}
        backTo={`/admin/onboarding/class${qs}`}
        skipTo={`/admin/onboarding/done${qs}`}
        nextLabel={t('onboarding.next')}
        onNext={onNext}
        submitting={submitting}
      >
        <div className="space-y-2">
          <Label>{t('onboarding.invite.email')}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@example.com" />
        </div>
      </OnboardingFrame>
    </div>
  );
}
