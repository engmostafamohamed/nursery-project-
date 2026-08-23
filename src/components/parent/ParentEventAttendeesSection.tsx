import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEventAttendees } from '@/hooks/useEventAttendees';

type Props = {
  eventId: string;
};

export function ParentEventAttendeesSection({ eventId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useEventAttendees(eventId);

  // No rows => either the nursery disabled the list, or none granted yet, or
  // the viewer isn't entitled. In all cases there is nothing to show.
  if (isPending || isError || !data || data.length === 0) return null;

  const name = (a: { display_name_ar: string; display_name_en: string }) =>
    (isAr ? a.display_name_ar : a.display_name_en) ||
    a.display_name_en ||
    a.display_name_ar ||
    '—';

  const preview = data.slice(0, 6);

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-on-surface">
          {t('parent.events.attendees.title', { count: data.length })}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-secondary hover:underline"
        >
          {t('parent.events.attendees.viewAll')}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {preview.map((a) => (
          <div key={a.child_id} className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {a.avatar_url ? <AvatarImage src={a.avatar_url} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {name(a).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-on-surface">{name(a)}</span>
          </div>
        ))}
        {data.length > preview.length ? (
          <span className="self-center text-xs text-on-surface-variant">
            {t('parent.events.attendees.more', { count: data.length - preview.length })}
          </span>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('parent.events.attendees.title', { count: data.length })}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
            {data.map((a) => (
              <div
                key={a.child_id}
                className="flex items-center gap-3 rounded-xl border border-outline-variant px-3 py-2"
              >
                <Avatar className="h-9 w-9">
                  {a.avatar_url ? <AvatarImage src={a.avatar_url} alt="" /> : null}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {name(a).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-on-surface">{name(a)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
