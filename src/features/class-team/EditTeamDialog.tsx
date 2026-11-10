import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { pickName, teamStatus, type TeamClass } from '@/lib/classTeam';

import { ClassTeamCard } from './ClassTeamCard';
import { TEAM_STATUS_LOOK } from './teamLook';
import type { ClassTeamEditing } from './useClassTeamEditing';

/**
 * One class's team, opened from the Teams table: the same editor as the class's edit page, each
 * change saved as it is made (the person is told); problems show under the place they are about.
 */
export function EditTeamDialog({ cls, editing, classHref, onClose }: {
  cls: TeamClass;
  editing: ClassTeamEditing;
  classHref?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const name = pickName(cls, i18n.language);
  const status = teamStatus(cls);
  const look = TEAM_STATUS_LOOK[status];
  const close = () => {
    editing.clearProblem();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !editing.busy && close()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="team-dialog">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{t('classTeam.dialog.title', { class: name })}</DialogTitle>
            <StatusPill tone={look.tone} icon={look.icon}>{t(`classTeam.status.${status}`)}</StatusPill>
          </div>
          <DialogDescription>
            {t('classTeam.card.children', { count: cls.children_count })}
            {cls.room_number ? ` · ${t('classTeam.card.room', { room: cls.room_number })}` : ''}
            {' · '}
            {t(editing.canUpdate ? 'classTeam.dialog.description' : 'classTeam.readOnly')}
          </DialogDescription>
        </DialogHeader>
        <ClassTeamCard
          cls={cls}
          staff={editing.staff}
          nameOf={editing.nameOf}
          canUpdate={editing.canUpdate}
          busy={editing.busy}
          problem={editing.problemFor(cls.id)}
          onPlace={(role, userId) => void editing.place(cls, role, userId)}
          onRemove={(userId) => void editing.takeOut(cls, userId)}
          embedded
        />
        <DialogFooter className="gap-2 border-t border-outline-variant pt-4 sm:justify-between sm:rtl:justify-between">
          {classHref ? (
            <Button asChild variant="ghost" className="gap-1 text-primary">
              <Link to={classHref}>
                <MaterialSymbol name="open_in_new" size="text-base" />
                {t('classTeam.dialog.openClass')}
              </Link>
            </Button>
          ) : <span />}
          <Button type="button" onClick={close} disabled={editing.busy} data-testid="team-dialog-done">
            {t('classTeam.dialog.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
