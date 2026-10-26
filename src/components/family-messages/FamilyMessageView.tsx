import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusPill } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { senderDepartmentName, senderPlaceName, senderRoleName } from '@/lib/familyMessageLabels';
import { childrenOf, senderParts, type ParentFamilyMessage, type SenderFields } from '@/lib/familyMessages';
import { getUserInitials } from '@/lib/utils';

/** The sender, with role, title, department and classes as separate badges (a message's or a daily report's). */
export function FamilyMessageSender({ message }: { message: SenderFields }) {
  const { t, i18n } = useTranslation();
  const parts = senderParts(message, i18n.language);
  const role = senderRoleName(t, parts.role);
  const department = senderDepartmentName(t, parts.department);
  const place = senderPlaceName(t, parts.place);
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {getUserInitials(parts.name ?? '', null)}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-on-surface">{parts.name ?? t('familyMessages.unknownSender')}</p>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone="primary" icon="badge">{role}</StatusPill>
          {parts.title && parts.title !== role ? <StatusPill tone="neutral" icon="workspace_premium">{parts.title}</StatusPill> : null}
          {department ? <StatusPill tone="neutral" icon="apartment">{department}</StatusPill> : null}
          {parts.classes ? (
            <StatusPill tone="neutral" icon="school">
              {place ? `${place} · ${parts.classes}` : parts.classes}
            </StatusPill>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The whole message in a dialog; opening it marks it read. */
export function FamilyMessageDialog({
  message,
  onClose,
  onRead,
}: {
  message: ParentFamilyMessage | null;
  onClose: () => void;
  onRead: (messageId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (message && !message.read_at && marked.current !== message.message_id) {
      marked.current = message.message_id;
      onRead(message.message_id);
    }
  }, [message, onRead]);

  return (
    <Dialog open={Boolean(message)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        {message ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('familyMessages.dialogTitle')}</DialogTitle>
              <DialogDescription>
                {new Date(message.created_at).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <FamilyMessageSender message={message} />
              <p className="whitespace-pre-line rounded-lg bg-surface-container-lowest p-3 text-sm leading-6 text-on-surface">{message.body}</p>
              <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <MaterialSymbol name="child_care" className="text-sm" />
                {t('familyMessages.about', { children: childrenOf(message, i18n.language) })}
              </p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
