import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { pickName, type TeamClass, type TeamTeacher } from '@/lib/classTeam';

import { roleName } from './useClassTeamEditing';

type T = ReturnType<typeof useTranslation>['t'];
type SortKey = 'name' | 'classes' | 'status';

function departmentName(t: T, department: string | null): string | null {
  if (department === 'finance') return t('classTeam.departments.finance');
  if (department === 'hr') return t('classTeam.departments.hr');
  if (department === 'operations') return t('classTeam.departments.operations');
  return null;
}

/** Every teacher and nanny: their job, the classes they are in and in which place, and whether their account is active. */
export function TeamTeachersTable({ staff, classById, filters, total, resetKey }: {
  staff: TeamTeacher[];
  classById: Map<string, TeamClass>;
  filters: ReactNode;
  total: number;
  resetKey: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const sort = useTableSort<SortKey>('name');
  const rows = sort.sorted(staff, {
    name: (a, b) => pickName(a, lang).localeCompare(pickName(b, lang)),
    classes: (a, b) => a.classes.length - b.classes.length,
    status: (a, b) => a.status.localeCompare(b.status),
  });
  const pager = usePagination(rows, 10, `${resetKey}|${sort.key}`);

  return (
    <TableCard
      title={t('classTeam.tabs.teachers')}
      count={t('classTeam.teachersTable.count', { count: staff.length })}
      filters={filters}
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {rows.length ? (
        <DataTable minWidth={820}>
          <THead>
            <Th sort={sort.sortFor('name')}>{t('classTeam.teachersTable.teacher')}</Th>
            <Th>{t('classTeam.teachersTable.role')}</Th>
            <Th sort={sort.sortFor('classes')}>{t('classTeam.teachersTable.classes')}</Th>
            <Th sort={sort.sortFor('status')}>{t('classTeam.teachersTable.status')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((teacher) => {
              const title = lang.startsWith('ar') ? teacher.role_title_ar || teacher.role_title_en : teacher.role_title_en || teacher.role_title_ar;
              const department = departmentName(t, teacher.department);
              return (
                <Tr key={teacher.id} data-testid="team-teacher-row">
                  <Td>
                    <p className="font-medium text-on-surface">{pickName(teacher, lang)}</p>
                    <p className="text-xs text-on-surface-variant" dir="ltr">{teacher.email || teacher.phone || ''}</p>
                  </Td>
                  <Td>
                    <p>{title || t('classTeam.teachersTable.teacherRole')}</p>
                    {department ? <p className="text-xs text-on-surface-variant">{department}</p> : null}
                  </Td>
                  <Td>
                    {teacher.classes.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {teacher.classes.map((c) => {
                          const cls = classById.get(c.class_id);
                          return (
                            <li key={c.class_id}>
                              <StatusPill tone={c.role === 'lead' ? 'primary' : 'neutral'}>
                                {cls ? pickName(cls, lang) : '—'} · {roleName(t, c.role)}
                              </StatusPill>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span className="text-sm text-warning">{t('classTeam.filters.noClass')}</span>
                    )}
                  </Td>
                  <Td>
                    <StatusPill tone={teacher.status === 'active' ? 'success' : 'neutral'}>
                      {teacher.status === 'active' ? t('classTeam.teachersTable.active') : t('classTeam.teachersTable.inactive')}
                    </StatusPill>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="badge" title={total ? t('classTeam.empty.noMatch') : t('classTeam.empty.teachers')} />
      )}
    </TableCard>
  );
}
