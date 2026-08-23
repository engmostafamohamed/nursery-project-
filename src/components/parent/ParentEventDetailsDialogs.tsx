import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ParentEventDetailsPermission } from '@/hooks/useParentEventDetails';

const NOTE_MAX = 200;

type Props = {
  denyTarget: ParentEventDetailsPermission | null;
  onDenyDialogOpenChange: (open: boolean) => void;
  denyNote: string;
  onDenyNoteChange: (v: string) => void;
  busyId: string | null;
  onConfirmDeny: () => void;
  onCloseDeny: () => void;
  displayChild: (p: ParentEventDetailsPermission) => string;
  eventTitle: string;
};

export function ParentEventDetailsDialogs({
  denyTarget,
  onDenyDialogOpenChange,
  denyNote,
  onDenyNoteChange,
  busyId,
  onConfirmDeny,
  onCloseDeny,
  displayChild,
  eventTitle,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <Dialog open={Boolean(denyTarget)} onOpenChange={onDenyDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('parent.permissions.denyTitle')}</DialogTitle>
            <DialogDescription>
              {denyTarget
                ? t('parent.permissions.denyDescription', {
                    child: displayChild(denyTarget),
                    event: eventTitle,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="event-deny-note">{t('parent.permissions.denyNoteLabel')}</Label>
            <Textarea
              id="event-deny-note"
              rows={3}
              maxLength={NOTE_MAX}
              value={denyNote}
              onChange={(e) => onDenyNoteChange(e.target.value.slice(0, NOTE_MAX))}
              placeholder={t('parent.permissions.denyNotePlaceholder')}
            />
            <p className="text-xs text-on-surface-variant">
              {denyNote.length}/{NOTE_MAX}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={Boolean(busyId)} onClick={onCloseDeny}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-error text-white hover:bg-error/90"
              disabled={Boolean(busyId)}
              onClick={() => void onConfirmDeny()}
            >
              {busyId ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" aria-hidden>
                    progress_activity
                  </span>
                  {t('parent.events.details.denying')}
                </>
              ) : (
                t('parent.permissions.denyConfirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
