import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ClassViewDialog } from '@/components/admin/ClassViewDialog';
import { ActionGate } from '@/components/shared/ActionGate';
import { confirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import {
  useDeleteClass,
  useNurseryClasses,
  type NurseryClassRow,
  type StaffPerson,
} from '@/hooks/useClassStaff';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';

type SortKey = 'name' | 'grade' | 'lead' | 'roster';

function localizedName(
  ar: string | null | undefined,
  en: string | null | undefined,
  pref: 'ar' | 'en' | 'both',
): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || '—';
  if (pref === 'en') return e || a || '—';
  if (a && e) return `${a} / ${e}`;
  return a || e || '—';
}

function staffName(p: StaffPerson | null, pref: 'ar' | 'en' | 'both', dash = '—'): string {
  if (!p) return dash;
  return localizedName(p.name_ar, p.name_en, pref) || dash;
}

export function AdminClassesListPage() {
  const { t } = useTranslation();
  const { activeNurseryId } = useActiveNurseryId();
  const { data: languagePref = 'both' } = useNurseryLanguagePref(activeNurseryId);
  const classesQuery = useNurseryClasses(activeNurseryId);
  const deleteMut = useDeleteClass();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewClassId, setViewClassId] = useState<string | null>(null);

  const onDelete = async (classId: string) => {
    if (!(await confirm({ description: t('admin.classes.actions.deleteConfirm'), variant: 'danger' })))
      return;
    try {
      await deleteMut.mutateAsync(classId);
      toast.success(t('admin.classes.toasts.deletedOk'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.deleteFailed'));
    }
  };

  const rows = useMemo<NurseryClassRow[]>(() => {
    const data = classesQuery.data ?? [];
    const filtered = search.trim()
      ? data.filter((c) => {
          const hay = `${c.name_ar} ${c.name_en} ${c.grade_level ?? ''} ${c.room_number ?? ''}`.toLowerCase();
          return hay.includes(search.trim().toLowerCase());
        })
      : data;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'grade':
          return ((a.grade_level ?? '').localeCompare(b.grade_level ?? '')) * dir;
        case 'lead':
          return staffName(a.lead, languagePref).localeCompare(staffName(b.lead, languagePref)) * dir;
        case 'roster':
          return (a.child_count - b.child_count) * dir;
        case 'name':
        default:
          return localizedName(a.name_ar, a.name_en, languagePref)
            .localeCompare(localizedName(b.name_ar, b.name_en, languagePref)) * dir;
      }
    });
  }, [classesQuery.data, search, sortBy, sortDir, languagePref]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key: SortKey) => (sortBy === key ? (sortDir === 'asc' ? '↑' : '↓') : '');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('admin.classes.list.title')}</h1>
          <p className="text-sm text-foreground-secondary">{t('admin.classes.list.subtitle')}</p>
        </div>
        <ActionGate feature="classes" action="create">
          <Button asChild>
            <Link to="/admin/classes/new">
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
              {t('admin.classes.actions.new')}
            </Link>
          </Button>
        </ActionGate>
      </div>

      <div className="max-w-md">
        <Input
          placeholder={t('admin.classes.list.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {classesQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="school"
          title={t('admin.classes.list.emptyTitle')}
          description={t('admin.classes.list.emptyDescription')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border-subtle bg-surface-low text-start text-xs uppercase tracking-wide text-foreground-secondary">
                  <tr>
                    <th className="px-4 py-2 text-start">
                      <button type="button" onClick={() => toggleSort('name')} className="font-semibold">
                        {t('admin.classes.list.colName')} {sortIcon('name')}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-start">
                      <button type="button" onClick={() => toggleSort('grade')} className="font-semibold">
                        {t('admin.classes.list.colGrade')} {sortIcon('grade')}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-start">{t('admin.classes.list.colRoom')}</th>
                    <th className="px-4 py-2 text-start">
                      <button type="button" onClick={() => toggleSort('lead')} className="font-semibold">
                        {t('admin.classes.list.colLead')} {sortIcon('lead')}
                      </button>
                    </th>
                    <th className="px-4 py-2 text-start">{t('admin.classes.list.colAssistants')}</th>
                    <th className="px-4 py-2 text-start">
                      <button type="button" onClick={() => toggleSort('roster')} className="font-semibold">
                        {t('admin.classes.list.colRoster')} {sortIcon('roster')}
                      </button>
                    </th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const overCapacity =
                      c.capacity != null && c.capacity > 0 && c.child_count > c.capacity;
                    return (
                      <tr key={c.id} className="border-b border-border-subtle last:border-b-0">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {localizedName(c.name_ar, c.name_en, languagePref)}
                        </td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.grade_level ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.room_number ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {staffName(c.lead, languagePref, t('admin.classes.list.noLead'))}
                        </td>
                        <td className="px-4 py-3 text-foreground-secondary">{c.assistants.length}</td>
                        <td className="px-4 py-3">
                          <span className={overCapacity ? 'font-semibold text-error' : ''}>
                            {c.child_count}
                            {c.capacity != null ? ` / ${c.capacity}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="flex items-center justify-end gap-2">
                            <ActionGate feature="classes" action="view">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setViewClassId(c.id)}
                              >
                                {t('common.view')}
                              </Button>
                            </ActionGate>
                            <ActionGate feature="classes" action="update">
                              <Button asChild variant="secondary" size="sm">
                                <Link to={`/admin/classes/${c.id}`}>{t('common.edit')}</Link>
                              </Button>
                            </ActionGate>
                            <ActionGate feature="classes" action="delete">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onDelete(c.id)}
                                disabled={deleteMut.isPending}
                              >
                                {t('common.delete')}
                              </Button>
                            </ActionGate>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ClassViewDialog
        classId={viewClassId}
        open={viewClassId !== null}
        onOpenChange={(o) => {
          if (!o) setViewClassId(null);
        }}
      />
    </div>
  );
}
