import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ChildQrCodeCard, type ChildQrInput } from '@/components/qr/ChildQrCodeCard';
import { DelegatePickupQrCard } from '@/components/qr/DelegatePickupQrCard';
import { ParentQrHistoryList } from '@/components/qr/ParentQrHistoryList';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

function localizedChildName(child: ChildQrInput, languagePref: 'ar' | 'en' | 'both'): string {
  const ar = (child.full_name_ar ?? '').trim();
  const en = (child.full_name_en ?? '').trim();
  if (languagePref === 'ar') return ar || en;
  if (languagePref === 'en') return en || ar;
  if (ar && en) return `${ar} / ${en}`;
  return ar || en || '-';
}

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

  const child = childQuery.data;
  const childDisplayName = localizedChildName(child, languagePref);
  const childLabels = [{
    id: child.id,
    nursery_id: child.nursery_id,
    displayName: childDisplayName,
  }];

  return (
    <div className="space-y-5 pb-6">
      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-lowest p-5">
          <p className="text-xs font-semibold uppercase text-primary">
            {t('qr.childPage.eyebrow', { defaultValue: 'Pickup QR settings' })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-on-surface">
            {childDisplayName}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">
            {t('qr.childPage.subtitle', {
              defaultValue: 'Use parent QR for regular pickup, or create a temporary custom QR for another authorized person.',
            })}
          </p>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-3">
          {[
            { icon: 'qr_code_2', title: t('qr.childPage.parentQrTitle', { defaultValue: 'Parent QR' }), body: t('qr.childPage.parentQrHint', { defaultValue: 'Always available until rotated.' }) },
            { icon: 'badge', title: t('qr.childPage.identityTitle', { defaultValue: 'Identity required' }), body: t('qr.childPage.identityHint', { defaultValue: 'Custom QR requires ID/passport details.' }) },
            { icon: 'event_busy', title: t('qr.childPage.deadlineTitle', { defaultValue: 'Expiry deadline' }), body: t('qr.childPage.deadlineHint', { defaultValue: 'Custom QR expires at the selected day end.' }) },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              <span className="material-symbols-outlined text-xl text-primary" aria-hidden>{item.icon}</span>
              <p className="mt-2 text-sm font-semibold text-on-surface">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Tabs defaultValue="parent">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="parent">
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>qr_code_2</span>
            {t('qr.childPage.tabs.parent', { defaultValue: 'Parent QR' })}
          </TabsTrigger>
          <TabsTrigger value="custom">
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>badge</span>
            {t('qr.childPage.tabs.custom', { defaultValue: 'Custom QR' })}
          </TabsTrigger>
          <TabsTrigger value="history">
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>history</span>
            {t('qr.parentPage.tabHistory')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parent" className="mt-4">
          <ChildQrCodeCard child={child} languagePref={languagePref} />
        </TabsContent>

        <TabsContent value="custom" className="mt-4">
          <DelegatePickupQrCard
            childId={child.id}
            nurseryId={child.nursery_id}
            childDisplayName={childDisplayName}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ParentQrHistoryList parentId={user?.id} children={childLabels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
