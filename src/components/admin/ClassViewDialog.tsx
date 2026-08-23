import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  useClassRoster,
  useClassWithStaff,
  type StaffPerson,
} from '@/hooks/useClassStaff';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';

function localized(
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

function personLabel(p: StaffPerson | null | undefined, pref: 'ar' | 'en' | 'both'): string {
  if (!p) return '—';
  return localized(p.name_ar, p.name_en, pref);
}

function initials(name: string): string {
  const parts = name.replace(/[/].*$/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ClassViewDialogProps {
  classId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Stat({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-low p-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          accent ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
        }`}
      >
        <MaterialSymbol name={icon} size="text-lg" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-foreground-secondary">{label}</p>
        <p className={`truncate text-base font-semibold ${accent ? 'text-error' : 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <MaterialSymbol name={icon} size="text-lg" className="text-foreground-secondary" />
      <span className="text-sm text-foreground-secondary">{label}</span>
      <span className="ms-auto text-end text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
      <MaterialSymbol name={icon} size="text-base" className="text-primary" />
      {children}
    </h3>
  );
}

function PersonRow({
  name,
  sub,
  to,
  onNavigate,
}: {
  name: string;
  sub?: string;
  /** When set, the row becomes a link to this path (e.g. the child record page). */
  to?: string;
  onNavigate?: () => void;
}) {
  const body = (
    <>
      <Avatar className="h-9 w-9 bg-primary/10">
        <AvatarFallback className="text-primary">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {sub ? <p className="truncate text-xs text-foreground-secondary">{sub}</p> : null}
      </div>
      {to ? <MaterialSymbol name="chevron_right" size="text-lg" className="text-foreground-secondary rtl:rotate-180" /> : null}
    </>
  );
  if (to) {
    return (
      <li>
        <Link
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-low p-3 transition-colors hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-low p-3">
      {body}
    </li>
  );
}

/** Read-only popup mirroring the class Edit page (details, staff, roster). */
export function ClassViewDialog({ classId, open, onOpenChange }: ClassViewDialogProps) {
  const { t } = useTranslation();
  const classQuery = useClassWithStaff(classId);
  const rosterQuery = useClassRoster(classId);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(classQuery.data?.nursery_id ?? null);

  const c = classQuery.data;
  const overCapacity = c?.capacity != null && c.capacity > 0 && c.child_count > c.capacity;
  const rosterValue = `${c?.child_count ?? 0}${c?.capacity != null ? ` / ${c.capacity}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {classQuery.isLoading ? (
          <div className="p-6">
            <LoadingSkeleton />
          </div>
        ) : !c ? (
          <div className="p-6">
            <p className="text-sm text-foreground-secondary">{t('admin.classes.detail.notFoundDescription')}</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start gap-4 border-b border-border-subtle bg-surface-low p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MaterialSymbol name="school" size="text-2xl" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {localized(c.name_ar, c.name_en, languagePref)}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {c.grade_level ? <Badge variant="secondary">{c.grade_level}</Badge> : null}
                  {c.room_number ? (
                    <Badge variant="outline">
                      <MaterialSymbol name="meeting_room" size="text-sm" className="me-1" />
                      {c.room_number}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {/* Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat icon="groups" label={t('admin.classes.list.colRoster')} value={rosterValue} accent={overCapacity} />
                <Stat icon="person" label={t('admin.classes.fields.leadTeacher')} value={personLabel(c.lead, languagePref)} />
                <Stat icon="badge" label={t('admin.classes.staff.assistantsTitle')} value={String(c.assistants.length)} />
              </div>

              {/* Details */}
              <section>
                <SectionTitle icon="info">{t('admin.classes.tabs.details')}</SectionTitle>
                <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-low">
                  <DetailRow icon="translate" label={t('admin.classes.fields.nameAr')} value={c.name_ar || '—'} />
                  <DetailRow icon="translate" label={t('admin.classes.fields.nameEn')} value={c.name_en || '—'} />
                  <DetailRow icon="stairs" label={t('admin.classes.fields.gradeLevel')} value={c.grade_level ?? '—'} />
                  <DetailRow icon="meeting_room" label={t('admin.classes.fields.roomNumber')} value={c.room_number ?? '—'} />
                  <DetailRow
                    icon="event_seat"
                    label={t('admin.classes.fields.capacity')}
                    value={c.capacity != null ? String(c.capacity) : '—'}
                  />
                  <DetailRow
                    icon="person"
                    label={t('admin.classes.fields.leadTeacher')}
                    value={personLabel(c.lead, languagePref)}
                  />
                </div>
              </section>

              {/* Staff */}
              <section>
                <SectionTitle icon="badge">{t('admin.classes.staff.assistantsTitle')}</SectionTitle>
                {c.assistants.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-subtle bg-surface-low px-3 py-4 text-center text-sm text-foreground-secondary">
                    {t('admin.classes.staff.noAssistants')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {c.assistants.map((a) => (
                      <PersonRow
                        key={a.id}
                        name={personLabel(a, languagePref)}
                        sub={a.email ?? a.phone ?? undefined}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* Roster */}
              <section>
                <SectionTitle icon="groups">
                  {t('admin.classes.roster.title')}
                  <span
                    className={`ms-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      overCapacity ? 'bg-error/10 text-error' : 'bg-surface-high text-foreground-secondary'
                    }`}
                  >
                    {rosterValue}
                  </span>
                </SectionTitle>
                {rosterQuery.isLoading ? (
                  <LoadingSkeleton />
                ) : (rosterQuery.data ?? []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-subtle bg-surface-low px-3 py-4 text-center text-sm text-foreground-secondary">
                    {t('admin.classes.roster.empty')}
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(rosterQuery.data ?? []).map((child) => (
                      <PersonRow
                        key={child.id}
                        name={localized(child.full_name_ar, child.full_name_en, languagePref)}
                        to={`/admin/children/${child.id}`}
                        onNavigate={() => onOpenChange(false)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}

        <DialogFooter className="border-t border-border-subtle p-4">
          <DialogClose asChild>
            <Button variant="secondary">{t('common.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
