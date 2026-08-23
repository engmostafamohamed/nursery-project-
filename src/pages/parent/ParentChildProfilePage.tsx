import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ChildQrCodeCard, type ChildQrInput } from '@/components/qr/ChildQrCodeCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export function ParentChildProfilePage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const childQuery = useQuery({
    queryKey: ['parent-child-profile', childId, user?.id],
    queryFn: async (): Promise<ChildQrInput | null> => {
      if (!user) return null;
      if (childId) {
        const { data, error } = await supabase
          .from('children')
          .select('id, nursery_id, full_name_ar, full_name_en')
          .eq('id', childId)
          .maybeSingle();
        if (error) throw error;
        return (data as ChildQrInput | null) ?? null;
      }

      const { data, error } = await supabase
        .from('parent_children')
        .select('child:children(id, nursery_id, full_name_ar, full_name_en)')
        .eq('parent_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const child = (data as { child?: ChildQrInput | null } | null)?.child;
      return child ?? null;
    },
    enabled: Boolean(user),
  });

  if (childQuery.isLoading) return <LoadingSkeleton />;
  if (!childQuery.data) {
    return (
      <EmptyState
        icon="qr_code_2"
        title={t('qr.noChildTitle')}
        description={t('qr.noChildDescription')}
      />
    );
  }

  return <ChildQrCodeCard child={childQuery.data} languagePref={languagePref} />;
}
