import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

import { AdminQrChildRow, type LatestQrToken } from '@/components/admin/AdminQrChildRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

type ChildRow = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
};

type QrRow = {
  child_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

type Filter = 'all' | 'active' | 'expired';

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function latestTokenByChild(rows: QrRow[]): Map<string, LatestQrToken> {
  const m = new Map<string, LatestQrToken>();
  for (const r of rows) {
    if (!m.has(r.child_id)) {
      m.set(r.child_id, { token: r.token, expires_at: r.expires_at });
    }
  }
  return m;
}

export function AdminQRCodesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [filter, setFilter] = useState<Filter>('all');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const childrenQuery = useQuery({
    queryKey: ['admin-qr-children', nurseryId, debouncedSearch],
    queryFn: async (): Promise<ChildRow[]> => {
      if (!nurseryId) return [];
      let q = supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, avatar_url')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (debouncedSearch.length > 0) {
        const pat = `%${escapeIlike(debouncedSearch)}%`;
        q = q.or(`full_name_ar.ilike.${pat},full_name_en.ilike.${pat}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChildRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const tokensQuery = useQuery({
    queryKey: ['admin-qr-tokens', nurseryId],
    queryFn: async (): Promise<QrRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('qr_tokens')
        .select('child_id, token, expires_at, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as QrRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const latestMap = useMemo(() => latestTokenByChild(tokensQuery.data ?? []), [tokensQuery.data]);

  const displayName = useCallback(
    (child: ChildRow) => {
      const ar = child.full_name_ar ?? '';
      const en = child.full_name_en ?? '';
      if (languagePref === 'ar') return ar || en;
      if (languagePref === 'en') return en || ar;
      return `${ar} / ${en}`;
    },
    [languagePref],
  );

  const filteredChildren = useMemo(() => {
    const list = childrenQuery.data ?? [];
    return list.filter((c) => {
      const latest = latestMap.get(c.id) ?? null;
      const exp = latest ? new Date(latest.expires_at).getTime() : 0;
      const active = Boolean(latest && exp > nowMs);
      const expired = Boolean(latest && exp <= nowMs);
      if (filter === 'active') return active;
      if (filter === 'expired') return expired;
      return true;
    });
  }, [childrenQuery.data, filter, latestMap, nowMs]);

  const printItems = useMemo(() => {
    return filteredChildren
      .map((c) => {
        const latest = latestMap.get(c.id) ?? null;
        if (!latest) return null;
        const exp = new Date(latest.expires_at).getTime();
        if (exp <= nowMs) return null;
        const url = `${window.location.origin}/qr/verify?token=${encodeURIComponent(latest.token)}`;
        return { child: c, url, name: displayName(c) };
      })
      .filter(Boolean) as { child: ChildRow; url: string; name: string }[];
  }, [displayName, filteredChildren, latestMap, nowMs]);

  const invalidateQr = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-qr-tokens', nurseryId] });
  }, [queryClient, nurseryId]);

  const waiting = authLoading || (Boolean(user?.id) && profilePending);

  if (waiting || (Boolean(nurseryId) && (childrenQuery.isPending || tokensQuery.isPending))) {
    return <LoadingSkeleton />;
  }

  if (!nurseryId) {
    return (
      <EmptyState
        icon="domain"
        title={t('qr.admin.noNurseryTitle')}
        description={t('qr.admin.noNurseryDescription')}
      />
    );
  }

  if (childrenQuery.isError || tokensQuery.isError) {
    return (
      <EmptyState
        icon="error"
        title={t('qr.admin.loadErrorTitle')}
        description={t('qr.admin.loadErrorDescription')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('qr.admin.title')}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{t('qr.admin.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={printItems.length === 0}
            onClick={() => window.print()}
          >
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              print
            </span>
            {t('qr.admin.printAll')}
          </Button>
        </div>
      </header>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('qr.admin.searchPlaceholder')}
        className="max-w-md"
      />

      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'expired'] as const).map((key) => (
          <button key={key} type="button" onClick={() => setFilter(key)}>
            <Badge
              className={
                filter === key
                  ? 'border-primary bg-primary-container text-white'
                  : 'cursor-pointer border-outline-variant'
              }
            >
              {t(`qr.admin.filter.${key}`)}
            </Badge>
          </button>
        ))}
      </div>

      {!filteredChildren.length ? (
        <EmptyState
          icon="qr_code_2"
          title={t('qr.admin.emptyTitle')}
          description={t('qr.admin.emptyDescription')}
        />
      ) : (
        <div className="space-y-4">
          {filteredChildren.map((child) => (
            <AdminQrChildRow
              key={child.id}
              child={child}
              displayName={displayName(child)}
              latest={latestMap.get(child.id) ?? null}
              nurseryId={nurseryId}
              nowMs={nowMs}
              onRegenerated={invalidateQr}
            />
          ))}
        </div>
      )}

      <div className="hidden print:block">
        <h1 className="mb-4 text-center text-lg font-bold">{t('qr.admin.printTitle')}</h1>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {printItems.map(({ child, url, name }) => (
            <div key={child.id} className="break-inside-avoid text-center">
              <p className="mb-2 text-sm font-semibold">{name}</p>
              <div className="inline-block rounded-lg border p-2">
                <QRCodeSVG value={url} size={160} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
