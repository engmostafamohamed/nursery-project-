import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';
import type { BilingualNames } from '@/hooks/useBilingualNames';

import { MESSAGE_STATUS_TONE } from './classLook';
import type { ClassMessage, ClassProfile } from './classProfile';
import type { ClassFormat } from './useClassFormat';

/**
 * What happens around the class: its photos and videos (waiting for approval, approved this month)
 * and the last messages its families received, class announcements and teachers' messages alike.
 */
export function ClassActivityPanel({ profile, names, format, base }: { profile: ClassProfile; names: BilingualNames; format: ClassFormat; base: string }) {
  const { t } = useTranslation();
  const { media } = profile;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          icon="pending_actions"
          label={t('classProfile.activity.mediaPending')}
          value={media.pending}
          helper={t('classProfile.activity.mediaPendingHint')}
          tone={media.pending ? 'warning' : 'neutral'}
          to={`${base}/media/approval`}
        />
        <StatTile
          icon="photo_library"
          label={t('classProfile.activity.mediaApproved')}
          value={media.approvedLast30Days}
          helper={t('classProfile.activity.mediaApprovedHint')}
          tone="primary"
          to={`${base}/media`}
        />
      </div>

      <TableCard
        title={t('classProfile.activity.messagesTitle')}
        description={t('classProfile.activity.messagesDescription')}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to={`${base}/classes/${profile.info.id}/announcements`}>
              <MaterialSymbol name="campaign" size="text-base" />
              {t('classProfile.activity.announce')}
            </Link>
          </Button>
        }
      >
        {profile.messages.length ? (
          <ol className="divide-y divide-outline-variant" data-testid="class-messages">
            {profile.messages.map((message) => (
              <MessageRow key={`${message.kind}-${message.id}`} message={message} names={names} format={format} />
            ))}
          </ol>
        ) : (
          <TableEmpty icon="forum" title={t('classProfile.activity.noMessagesTitle')} description={t('classProfile.activity.noMessagesDescription')} />
        )}
      </TableCard>
    </div>
  );
}

function MessageRow({ message, names, format }: { message: ClassMessage; names: BilingualNames; format: ClassFormat }) {
  const { t, i18n } = useTranslation();
  const arabic = i18n.language.startsWith('ar');
  const body = (arabic ? message.bodyAr || message.bodyEn : message.bodyEn || message.bodyAr).trim();
  const announcement = message.kind === 'announcement';
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MaterialSymbol name={announcement ? 'campaign' : 'forum'} size="text-lg" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
          <span className="font-semibold text-on-surface">
            {announcement ? t('classProfile.activity.kindAnnouncement') : t('classProfile.activity.kindFamilyMessage')}
          </span>
          {message.senderAr || message.senderEn ? <span>· {names.lines(message.senderAr, message.senderEn).primary}</span> : null}
          <span>· {format.moment(message.sentAt)}</span>
          {message.status !== 'sent' ? (
            <StatusPill tone={MESSAGE_STATUS_TONE[message.status]}>{t(`classProfile.activity.status.${message.status}`)}</StatusPill>
          ) : null}
        </div>
        <p className="line-clamp-3 whitespace-pre-line text-sm text-on-surface">{body}</p>
      </div>
    </li>
  );
}
