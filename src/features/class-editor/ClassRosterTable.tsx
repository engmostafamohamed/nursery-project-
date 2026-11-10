import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import { DataTable, IconAction, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { ClassCapacityMeter } from '@/features/classes/ClassCapacityMeter';
import { usePagination } from '@/hooks/usePagination';
import { formatDay } from '@/lib/datetime';
import { getUserInitials } from '@/lib/utils';

import { AddChildrenDialog } from './AddChildrenDialog';
import { ageOf, childName, classEditorErrorKey, searchChildren, type ClassEditor } from './classEditor';
import { useMoveChildren } from './classEditorApi';
import { MoveChildrenDialog } from './MoveChildrenDialog';
import { useAgeText } from './useAgeText';

/**
 * The class's children as a table: searched by name or code, a page at a time, each with their age,
 * gender and since when they are in the nursery, and a link to their record. Children are added
 * (from those without a class, or moved from another), moved to another class, or taken out of this
 * one, one at a time or several ticked at once.
 */
export function ClassRosterTable({ editor, className, base, canUpdate }: { editor: ClassEditor; className: string; base: string; canUpdate: boolean }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const ageText = useAgeText();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<string[] | null>(null);
  const removeOut = useMoveChildren();
  const shown = useMemo(() => searchChildren(editor.children, search), [editor.children, search]);
  const pager = usePagination(shown, 10, search);
  const pageIds = pager.pageItems.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  // A child no longer in the class is no longer selected.
  const picked = editor.children.filter((c) => selected.has(c.id));
  const nameOf = (id: string) => childName(editor.children.find((c) => c.id === id) ?? { nameAr: '', nameEn: '' }, isArabic);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const togglePage = () => setSelected((s) => {
    const next = new Set(s);
    for (const id of pageIds) {
      if (allOnPage) next.delete(id);
      else next.add(id);
    }
    return next;
  });

  const takeOut = async (ids: string[]) => {
    const ok = await confirm({
      title: ids.length === 1 ? t('classEditor.remove.titleOne', { name: nameOf(ids[0]), class: className }) : t('classEditor.remove.titleMany', { count: ids.length, class: className }),
      description: t('classEditor.remove.body'),
      confirmText: t('classEditor.remove.confirm'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await removeOut.mutateAsync({ childIds: ids, classId: null });
      toast.success(t('classEditor.remove.done', { count: ids.length }));
      setSelected(new Set());
    } catch (error) {
      toast.error(t(classEditorErrorKey(error)));
    }
  };

  return (
    <>
      <TableCard
        title={t('classEditor.roster.title')}
        count={t('classEditor.roster.count', { count: editor.children.length })}
        description={t('classEditor.roster.description')}
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden min-w-[9rem] sm:block">
              <ClassCapacityMeter count={editor.children.length} capacity={editor.cls?.capacity ?? null} />
            </div>
            {canUpdate ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding(true)} data-testid="add-children">
                <MaterialSymbol name="person_add" size="text-base" />
                {t('classEditor.roster.add')}
              </Button>
            ) : null}
          </div>
        }
        filters={
          <div className="space-y-3">
            <FilterBar onClear={() => setSearch('')} canClear={Boolean(search)}>
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('classEditor.picker.search')} />
              </FilterField>
            </FilterBar>
            {canUpdate && picked.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2" data-testid="roster-bulk">
                <span className="text-sm font-medium text-on-surface">{t('classEditor.roster.selected', { count: picked.length })}</span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setMoving(picked.map((c) => c.id))} disabled={!editor.classes.length}>
                    <MaterialSymbol name="move_up" size="text-base" />
                    {t('classEditor.roster.move')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="gap-1 text-error" onClick={() => void takeOut(picked.map((c) => c.id))} disabled={removeOut.isPending}>
                    <MaterialSymbol name="person_remove" size="text-base" />
                    {t('classEditor.roster.remove')}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('classEditor.roster.clearSelection')}</Button>
                </span>
              </div>
            ) : null}
          </div>
        }
        pagination={shown.length ? <TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} /> : null}
      >
        {!shown.length ? (
          <TableEmpty
            icon="child_care"
            title={editor.children.length ? t('classEditor.roster.noMatch') : t('classEditor.roster.empty')}
            description={editor.children.length ? undefined : t('classEditor.roster.emptyHint')}
            action={!editor.children.length && canUpdate ? <Button type="button" onClick={() => setAdding(true)}>{t('classEditor.roster.add')}</Button> : undefined}
          />
        ) : (
          <DataTable minWidth={760}>
            <THead>
              {canUpdate ? (
                <Th className="w-10">
                  <Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label={t('classEditor.picker.selectPage')} />
                </Th>
              ) : null}
              <Th>{t('classEditor.table.child')}</Th>
              <Th>{t('classEditor.table.age')}</Th>
              <Th>{t('classEditor.table.gender')}</Th>
              <Th>{t('classEditor.table.since')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((c) => {
                const name = childName(c, isArabic);
                const other = isArabic ? c.nameEn : c.nameAr;
                return (
                  <Tr key={c.id} className={selected.has(c.id) ? 'bg-primary/5' : undefined} data-testid="roster-row">
                    {canUpdate ? (
                      <Td className="w-10">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label={t('classEditor.picker.select', { name })} />
                      </Td>
                    ) : null}
                    <Td>
                      <Link to={`${base}/children/${c.id}`} className="group flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                          {getUserInitials(name, null)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-on-surface group-hover:text-primary group-hover:underline">{name}</span>
                          <span className="block truncate text-xs text-on-surface-variant">
                            {[other && other !== name ? other : '', c.code ?? ''].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{ageText(ageOf(c.dob, editor.today))}</Td>
                    <Td className="text-on-surface-variant">{c.gender ? t(`classEditor.gender.${c.gender}`) : '—'}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{c.enrolledOn ? formatDay(c.enrolledOn) : '—'}</Td>
                    <Td align="end">
                      {canUpdate ? (
                        <span className="inline-flex items-center">
                          <IconAction icon="move_up" label={t('classEditor.roster.moveOne', { name })} onClick={() => setMoving([c.id])} disabled={!editor.classes.length} />
                          <IconAction icon="person_remove" danger label={t('classEditor.roster.removeOne', { name })} onClick={() => void takeOut([c.id])} disabled={removeOut.isPending} />
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      {adding ? <AddChildrenDialog editor={editor} className={className} onClose={() => setAdding(false)} /> : null}
      {moving ? (
        <MoveChildrenDialog
          childIds={moving}
          names={moving.map(nameOf)}
          classes={editor.classes}
          onClose={() => setMoving(null)}
        />
      ) : null}
    </>
  );
}
