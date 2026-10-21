import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useParentChildren, type ChildOption } from '@/hooks/useParentChildren';

type ChildSelectorProps = {
  value: string;
  onChange: (childId: string) => void;
  children?: ChildOption[];
  showAllOption?: boolean;
  autoSelectFirst?: boolean;
  /** Plain labelled menu, to sit in a row of other filters instead of in its own box. */
  inline?: boolean;
};

export function ChildSelector({ value, onChange, children: childrenProp, showAllOption = true, autoSelectFirst = false, inline = false }: ChildSelectorProps) {
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

  if (inline) {
    return <FilterMenu value={value} options={options} onChange={onChange} label={t('parent.childSelector.label')} />;
  }

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
