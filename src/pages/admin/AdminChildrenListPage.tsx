import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import { formatQueryError } from '@/lib/utils';

type ChildItem = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
};

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function AdminChildrenListPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const {
    data: profile,
    isPending: profilePending,
    isError: isProfileQueryError,
    error: profileQueryError,
  } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const childrenQuery = useQuery({
    queryKey: ['admin-children-list', nurseryId, debouncedSearch],
    queryFn: async (): Promise<ChildItem[]> => {
      if (!nurseryId) return [];

      let q = supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, avatar_url')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });

      if (debouncedSearch.length > 0) {
        const pat = `%${escapeIlike(debouncedSearch)}%`;
        q = q.or(`full_name_ar.ilike.${pat},full_name_en.ilike.${pat}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChildItem[];
    },
    enabled: Boolean(nurseryId),
  });

  const waitingForAuthOrProfile = authLoading || (Boolean(user?.id) && profilePending);

  const displayName = useMemo(() => {
    return (child: ChildItem) => {
      const ar = typeof child.full_name_ar === 'string' ? child.full_name_ar.trim() : '';
      const en = typeof child.full_name_en === 'string' ? child.full_name_en.trim() : '';
      if (languagePref === 'ar') return ar || en || '—';
      if (languagePref === 'en') return en || ar || '—';
      if (ar && en) return `${ar} / ${en}`;
      return ar || en || '—';
    };
  }, [languagePref]);

  const children = childrenQuery.data ?? [];
  const pager = usePagination(children, 20);

  if (waitingForAuthOrProfile || (Boolean(nurseryId) && childrenQuery.isPending)) {
    return <LoadingSkeleton />;
  }

  if (isProfileQueryError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {formatQueryError(profileQueryError)}
      </p>
    );
  }

  if (user && !nurseryId) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('admin.children.missingNursery')}
      </p>
    );
  }

  if (childrenQuery.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {formatQueryError(childrenQuery.error)}
      </p>
    );
  }

  if (!children.length && !debouncedSearch) {
    return (
      <EmptyState
        icon="groups"
        title={t('admin.children.emptyTitle')}
        description={t('admin.children.emptyDescription')}
      />
    );
  }

  if (!children.length && debouncedSearch) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.children.title')}</h1>
        <Input
          placeholder={t('admin.children.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            pager.setPage(1);
          }}
          className="max-w-md"
          aria-label={t('admin.children.searchPlaceholder')}
        />
        <EmptyState icon="search_off" title={t('admin.children.searchEmptyTitle')} description={t('admin.children.searchEmptyDescription')} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-on-surface">{t('admin.children.title')}</h1>
      <Input
        placeholder={t('admin.children.searchPlaceholder')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          pager.setPage(1);
        }}
        className="max-w-md"
        aria-label={t('admin.children.searchPlaceholder')}
      />
      <div className="space-y-2">
        {pager.pageItems.map((child) => {
          const name = displayName(child);
          const thumb =
            child.avatar_url ??
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=eceef0&color=191c1e`;
          return (
            <Link
              key={child.id}
              to={`/admin/children/${child.id}`}
              className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface"
            >
              <img src={thumb} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </Link>
          );
        })}
      </div>
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        total={pager.total}
        startIndex={pager.startIndex}
        endIndex={pager.endIndex}
        hasPrev={pager.hasPrev}
        hasNext={pager.hasNext}
        onPrev={pager.prev}
        onNext={pager.next}
      />
    </div>
  );
}
