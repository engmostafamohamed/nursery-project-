import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { CLASS_TEAM_ROLES, lead, pickName, substitute, type ClassTeamRole, type TeamClass } from '@/lib/classTeam';
import { cn } from '@/lib/utils';

import { roleName } from './useClassTeamEditing';

export type MoveTarget = {
  /** The class she is leaving. */
  from: TeamClass;
  userId: string;
  /** The place she holds there now, offered first for the new class. */
  role: ClassTeamRole;
};

/**
 * Moving a teacher from one class to another: the nursery picks the class she goes to and the place
 * she takes there. Taking the lead's or the backup's place says who steps out, since a class has
 * only one of each. She leaves the first class and joins the second as one change.
 */
export function MoveTeacherDialog({
  target,
  classes,
  nameOf,
  busy,
  onMove,
  onClose,
}: {
  target: MoveTarget | null;
  classes: TeamClass[];
  nameOf: (id: string | null) => string;
  busy: boolean;
  onMove: (to: TeamClass, role: ClassTeamRole) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [toId, setToId] = useState('');
  const [role, setRole] = useState<ClassTeamRole | ''>('');

  const fromId = target?.from.id ?? null;
  const others = useMemo(() => classes.filter((c) => c.id !== fromId), [classes, fromId]);
  const to = others.find((c) => c.id === toId) ?? null;
  const chosenRole = (role || target?.role) as ClassTeamRole | undefined;
  // Whoever holds that single place in the new class steps out when she takes it.
  const stepsOut = to && chosenRole && (chosenRole === 'lead' || chosenRole === 'substitute')
    ? (chosenRole === 'lead' ? lead(to) : substitute(to))
    : null;

  if (!target) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('classTeam.move.title', { name: nameOf(target.userId) })}</DialogTitle>
          <DialogDescription>
            {t('classTeam.move.hint', { from: pickName(target.from, lang), role: roleName(t, target.role) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="move-class">{t('classTeam.move.toClass')}</Label>
            <Select id="move-class" value={toId} disabled={busy} onChange={(e) => setToId(e.target.value)} data-testid="move-to-class">
              <option value="">{t('classTeam.move.chooseClass')}</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>{pickName(c, lang)}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="move-role">{t('classTeam.move.asRole')}</Label>
            <Select
              id="move-role"
              value={role || target.role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as ClassTeamRole)}
              data-testid="move-role"
            >
              {CLASS_TEAM_ROLES.map((r) => (
                <option key={r} value={r}>{roleName(t, r)}</option>
              ))}
            </Select>
          </div>

          {stepsOut && stepsOut !== target.userId ? (
            <p className={cn('flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning')} role="alert">
              <MaterialSymbol name="info" className="mt-px text-sm" />
              {t('classTeam.move.stepsOut', { name: nameOf(stepsOut), role: roleName(t, chosenRole as ClassTeamRole) })}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!to || busy}
            onClick={() => to && onMove(to, (role || target.role) as ClassTeamRole)}
            data-testid="move-confirm"
          >
            <MaterialSymbol name="move_down" size="text-base" className="me-1" />
            {t('classTeam.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
