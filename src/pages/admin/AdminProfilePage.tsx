import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import { formatQueryError } from '@/lib/utils';

export function AdminProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const { data: profile, isPending, isError } = useUserProfile(user?.id);

  const [fields, setFields] = useState({ nameAr: '', nameEn: '', phone: '' });

  useEffect(() => {
    if (!profile) return;
    setFields({
      nameAr: profile.name_ar ?? '',
      nameEn: profile.name_en ?? '',
      phone: profile.phone ?? '',
    });
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('no user');
      const { error } = await supabase
        .from('users')
        .update({
          name_ar: fields.nameAr.trim() || profile?.name_ar || '',
          name_en: fields.nameEn.trim() || profile?.name_en || '',
          phone: fields.phone.trim() || null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] });
      toast.success(t('admin.profile.saveSuccess'));
    },
    onError: (err: unknown) => {
      toast.error(t('admin.profile.saveError'), { description: formatQueryError(err) });
    },
  });

  if (isPending) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <p className="text-sm text-error" role="alert">
        {t('admin.profile.loadError')}
      </p>
    );
  }

  const email = profile.email ?? user?.email ?? '';

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('admin.profile.title')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('admin.profile.description')}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="space-y-2">
          <Label htmlFor="profile-name-ar">{t('admin.profile.nameAr')}</Label>
          <Input
            id="profile-name-ar"
            value={fields.nameAr}
            onChange={(e) => setFields((f) => ({ ...f, nameAr: e.target.value }))}
            autoComplete="name"
            placeholder={t('admin.profile.nameAr')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-name-en">{t('admin.profile.nameEn')}</Label>
          <Input
            id="profile-name-en"
            value={fields.nameEn}
            onChange={(e) => setFields((f) => ({ ...f, nameEn: e.target.value }))}
            autoComplete="name"
            placeholder={t('admin.profile.nameEn')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">{t('admin.profile.email')}</Label>
          <Input id="profile-email" value={email} readOnly className="bg-surface-container-low" />
          <p className="text-xs text-on-surface-variant">{t('admin.profile.emailReadOnly')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">{t('admin.profile.phone')}</Label>
          <Input
            id="profile-phone"
            value={fields.phone}
            onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('admin.profile.phone')}
          />
        </div>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? t('common.saving') : t('admin.profile.save')}
        </Button>
      </form>
    </div>
  );
}
