import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { assistants, candidatesFor, lead, nannies, otherClassesLed, pickName, substitute, teamStatus, type ClassTeamRole, type TeamClass, type TeamTeacher } from '@/lib/classTeam';
import { cn } from '@/lib/utils';

import { TEAM_STATUS_LOOK } from './teamLook';
import type { TeamProblem } from './useClassTeamEditing';

/**
 * A class's team editor: its lead teacher, backup teacher, assistants and nannies, each changeable
 * in place and checked as it stands (no lead, no backup, someone inactive, a lead of several
 * classes); a refused change shows under the place it was for. The same editor on a class's edit
 * page and in the Teams table's dialog (`embedded`: without its own frame and title).
 */
export function ClassTeamCard({
  cls,
  staff,
  nameOf,
  canUpdate,
  busy,
  onPlace,
  onRemove,
  problem = null,
  embedded = false,
}: {
  cls: TeamClass;
  staff: TeamTeacher[];
  nameOf: (id: string | null) => string;
  canUpdate: boolean;
  busy: boolean;
  onPlace: (role: ClassTeamRole, userId: string) => void;
  onRemove: (userId: string) => void;
  problem?: TeamProblem | null;
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const leadId = lead(cls);
  const substituteId = substitute(cls);
  const person = (id: string | null) => (id ? staff.find((s) => s.id === id) : undefined);
  const refusal = (role: ClassTeamRole) => (problem?.role === role ? problem.message : null);
  const teacherOption = (s: TeamTeacher) => (
    <option key={s.id} value={s.id}>
      {pickName(s, lang)}
      {s.classes.length ? ` (${s.classes.length})` : ''}
    </option>
  );

  /** What is wrong with a place as it stands (an error), or worth knowing (a note). */
  const check = (role: 'lead' | 'substitute', current: string | null): { error: string | null; note: string | null } => {
    const who = person(current);
    if (refusal(role)) return { error: refusal(role), note: null };
    if (current && who && who.status !== 'active') return { error: t('classTeam.check.inactive', { name: nameOf(current) }), note: null };
    if (role === 'lead') {
      if (!current) return { error: t('classTeam.check.leadRequired'), note: null };
      const others = otherClassesLed(who, cls.id);
      return { error: null, note: others ? t('classTeam.check.leadsOthers', { count: others }) : null };
    }
    return { error: null, note: current ? null : t('classTeam.check.noBackup') };
  };

  /** One place (lead or backup): a picker for whoever may change it, the name otherwise. */
  const slot = (role: 'lead' | 'substitute', current: string | null) => {
    const id = `team-${role}`;
    const { error, note } = check(role, current);
    return (
      <div className="space-y-1" data-testid={id}>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
          <MaterialSymbol name={role === 'lead' ? 'star' : 'swap_horiz'} className="text-sm" />
          {t(role === 'lead' ? 'classTeam.roles.lead' : 'classTeam.roles.substitute')}
        </p>
        {canUpdate ? (
          <div className="flex items-center gap-2">
            <Select
              id={id}
              className={cn('h-10 text-sm', error && invalidFieldClass)}
              aria-label={t(role === 'lead' ? 'classTeam.roles.lead' : 'classTeam.roles.substitute')}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : note ? `${id}-note` : undefined}
              value={current ?? ''}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onPlace(role, e.target.value);
              }}
            >
              <option value="" disabled>
                {t('classTeam.card.choose')}
              </option>
              {current ? <option value={current}>{nameOf(current)}</option> : null}
              {candidatesFor(cls, staff, role).map(teacherOption)}
            </Select>
            {current ? (
              <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={t('classTeam.card.remove', { name: nameOf(current) })} onClick={() => onRemove(current)}>
                <MaterialSymbol name="person_remove" className="text-error" />
              </Button>
            ) : null}
          </div>
        ) : (
          <p className={cn('text-sm', current ? 'font-medium text-on-surface' : 'text-on-surface-variant')}>{current ? nameOf(current) : t('classTeam.card.none')}</p>
        )}
        <FieldError id={`${id}-error`} message={error} />
        {note && !error ? (
          <p id={`${id}-note`} className="flex items-start gap-1 text-xs text-warning">
            <MaterialSymbol name="info" className="text-sm" />
            {note}
          </p>
        ) : null}
      </div>
    );
  };

  // An assistant or a nanny is any active member of staff not already in this class.
  const freeStaff = staff.filter((s) => s.status === 'active' && !cls.members.some((m) => m.user_id === s.id));

  /** The places a class has several of: assistants and nannies. */
  const many = (role: 'assistant' | 'nanny', ids: string[]) => (
    <div className="space-y-2" data-testid={`team-${role}s`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <MaterialSymbol name={role === 'assistant' ? 'group' : 'diversity_1'} className="text-sm" />
        {t(role === 'assistant' ? 'classTeam.roles.assistant' : 'classTeam.roles.nanny')}
      </p>
      {ids.length ? (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li
              key={id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border bg-surface-container-lowest py-1 ps-3 pe-1 text-sm',
                person(id)?.status === 'active' ? 'border-outline-variant' : 'border-error/50 text-error',
              )}
              title={person(id)?.status === 'active' ? undefined : t('classTeam.check.inactive', { name: nameOf(id) })}
            >
              {nameOf(id)}
              {canUpdate ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(id)}
                  aria-label={t('classTeam.card.remove', { name: nameOf(id) })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error"
                >
                  <MaterialSymbol name="close" className="text-sm" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">{t(role === 'assistant' ? 'classTeam.card.noAssistants' : 'classTeam.card.noNannies')}</p>
      )}
      {canUpdate && freeStaff.length ? (
        <Select
          className={cn('h-10 text-sm', refusal(role) && invalidFieldClass)}
          aria-label={t(role === 'assistant' ? 'classTeam.card.addAssistant' : 'classTeam.card.addNanny')}
          aria-invalid={Boolean(refusal(role))}
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onPlace(role, e.target.value);
          }}
        >
          <option value="">{t(role === 'assistant' ? 'classTeam.card.addAssistant' : 'classTeam.card.addNanny')}</option>
          {freeStaff.map(teacherOption)}
        </Select>
      ) : null}
      <FieldError id={`team-${role}-error`} message={refusal(role)} />
    </div>
  );

  const status = teamStatus(cls);
  const look = TEAM_STATUS_LOOK[status];

  return (
    <article className={cn('flex flex-col gap-4', !embedded && 'rounded-xl border border-outline-variant bg-surface p-4 shadow-sm')} data-testid="class-team-editor">
      {embedded ? null : (
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-on-surface">{pickName(cls, lang)}</h3>
            <p className="text-xs text-on-surface-variant">
              {t('classTeam.card.children', { count: cls.children_count })}
              {cls.capacity ? ` · ${t('classTeam.card.capacity', { capacity: cls.capacity })}` : ''}
              {cls.room_number ? ` · ${t('classTeam.card.room', { room: cls.room_number })}` : ''}
            </p>
          </div>
          <StatusPill tone={look.tone} icon={look.icon}>{t(`classTeam.status.${status}`)}</StatusPill>
        </header>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {slot('lead', leadId)}
        {slot('substitute', substituteId)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {many('assistant', assistants(cls))}
        {many('nanny', nannies(cls))}
      </div>

      <FormProblem message={problem && problem.role === null ? problem.message : null} />
    </article>
  );
}
