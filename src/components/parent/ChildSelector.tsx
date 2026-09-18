import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export type ChildOption = {
  id: string;
  nameAr: string;
  nameEn: string;
};

export function useParentChildren() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;

  const query = useQuery({
    queryKey: ['parent-children-list', user?.id, nurseryId],
    queryFn: async () => {
      if (!user?.id || !nurseryId) return [] as ChildOption[];
      const links = await supabase.from('parent_children').select('child_id').eq('parent_id', user.id);
      if (links.error) throw links.error;
      const ids = [...new Set(((links.data ?? []) as { child_id: string }[]).map((r) => r.child_id))];
      if (!ids.length) return [] as ChildOption[];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .in('id', ids)
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name_ar: string; full_name_en: string }[]).map((c) => ({
        id: c.id,
        nameAr: c.full_name_ar,
        nameEn: c.full_name_en,
      }));
    },
    enabled: Boolean(user?.id && nurseryId),
  });

  return query;
}

type ChildSelectorProps = {
  value: string;
  onChange: (childId: string) => void;
  children?: ChildOption[];
  showAllOption?: boolean;
  autoSelectFirst?: boolean;
};

export function ChildSelector({ value, onChange, children: childrenProp, showAllOption = true, autoSelectFirst = false }: ChildSelectorProps) {
  const { t, i18n } = useTranslation();
  const parentChildrenQuery = useParentChildren();
  const children = childrenProp ?? parentChildrenQuery.data ?? [];

  useEffect(() => {
    if (autoSelectFirst && !value && children.length > 0) {
      onChange(children[0].id);
    }
  }, [children, value, autoSelectFirst, onChange]);

  const getName = useMemo(() => {
    return (c: ChildOption) => i18n.language === 'ar' ? (c.nameAr || c.nameEn) : (c.nameEn || c.nameAr);
  }, [i18n.language]);

  const options = useMemo<FilterMenuOption[]>(() => {
    const childOptions = children.map((c) => ({
      value: c.id,
      label: getName(c),
      icon: 'face',
    }));
    return showAllOption
      ? [{ value: '', label: t('parent.childSelector.allChildren'), icon: 'groups' }, ...childOptions]
      : childOptions;
  }, [children, getName, showAllOption, t]);

  if (children.length <= 1) return null;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-on-surface">
        <MaterialSymbol name="face" size="text-lg" />
        {t('parent.childSelector.label')}
      </label>
      <FilterMenu value={value} options={options} onChange={onChange} />
    </div>
  );
}
