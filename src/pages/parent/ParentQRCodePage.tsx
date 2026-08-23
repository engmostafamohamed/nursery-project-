import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ChildQrCodeCard } from '@/components/qr/ChildQrCodeCard';
import { DelegatePickupQrCard } from '@/components/qr/DelegatePickupQrCard';
import { ParentQrHistoryList } from '@/components/qr/ParentQrHistoryList';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { supabase } from '@/lib/supabase';

type ChildRow = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
};

function localizedChildName(child: ChildRow, pref: NurseryLanguagePref): string {
  const ar = (child.full_name_ar ?? '').trim();
  const en = (child.full_name_en ?? '').trim();
  if (pref === 'ar') return ar || en;
  if (pref === 'en') return en || ar;
  if (ar && en) return `${ar} / ${en}`;
  return ar || en;
}

export function ParentQRCodePage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const parentId = user?.id;

  const childrenQuery = useQuery({
    queryKey: ['parent-qr-children', parentId],
    queryFn: async (): Promise<ChildRow[]> => {
      if (!parentId) return [];
      const { data: links, error: linkErr } = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', parentId);
      if (linkErr) throw linkErr;
      const ids = (links ?? []).map((r) => (r as { child_id: string }).child_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, nursery_id, full_name_ar, full_name_en, avatar_url')
        .in('id', ids)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as ChildRow[];
    },
    enabled: Boolean(parentId),
  });

  const nurseryId = childrenQuery.data?.[0]?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);

  const children = childrenQuery.data ?? [];
  const childLabels = useMemo(
    () =>
      children.map((c) => ({
        id: c.id,
        nursery_id: c.nursery_id,
        displayName: localizedChildName(c, languagePref),
      })),
    [children, languagePref],
  );

  if (authLoading || (Boolean(parentId) && childrenQuery.isPending)) {
    return <LoadingSkeleton />;
  }

  if (childrenQuery.isError) {
    return (
      <EmptyState
        icon="error"
        title={t('qr.parentPage.loadErrorTitle')}
        description={t('qr.parentPage.loadErrorDescription')}
      />
    );
  }

  if (!children.length) {
    return (
      <EmptyState
        icon="qr_code_2"
        title={t('qr.noChildTitle')}
        description={t('qr.noChildDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('qr.parentPage.title')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('qr.parentPage.subtitle')}</p>
      </div>

      <Tabs defaultValue="live">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="live">{t('qr.parentPage.tabLive')}</TabsTrigger>
          <TabsTrigger value="history">{t('qr.parentPage.tabHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <div className="space-y-6">
            {children.map((child) => (
              <div key={child.id} className="space-y-3">
                <ChildQrCodeCard
                  child={child}
                  languagePref={languagePref}
                  qrSize={280}
                  showPrint={false}
                />
                <DelegatePickupQrCard
                  childId={child.id}
                  nurseryId={child.nursery_id}
                  childDisplayName={localizedChildName(child, languagePref)}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <ParentQrHistoryList parentId={parentId} children={childLabels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
