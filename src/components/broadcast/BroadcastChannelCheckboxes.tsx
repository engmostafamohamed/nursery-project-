import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { BroadcastChannel } from '@/types/tables/batch3';

const ALL_CHANNELS: BroadcastChannel[] = ['in_app', 'whatsapp', 'sms', 'email'];

export const CHANNEL_LABEL_KEY: Record<BroadcastChannel, string> = {
  in_app: 'broadcastPage.channelInApp',
  whatsapp: 'broadcastPage.channelWhatsapp',
  sms: 'broadcastPage.channelSms',
  email: 'broadcastPage.channelEmail',
};

type Props = {
  value: BroadcastChannel[];
  onChange: (next: BroadcastChannel[]) => void;
  /** Channel keys the user cannot toggle (e.g. teacher external channels) */
  lockedOut?: BroadcastChannel[];
};

export function BroadcastChannelCheckboxes({ value, onChange, lockedOut = [] }: Props) {
  const { t } = useTranslation();
  const locked = new Set(lockedOut);

  const toggle = (ch: BroadcastChannel, checked: boolean) => {
    if (locked.has(ch)) return;
    if (checked) {
      onChange([...new Set([...value, ch])]);
    } else {
      const next = value.filter((c) => c !== ch);
      onChange(next.length ? next : ['in_app']);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{t('broadcastPage.channelsLabel')}</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        {ALL_CHANNELS.map((ch) => {
          const isLocked = locked.has(ch);
          return (
            <label
              key={ch}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant bg-surface text-foreground px-3 py-2 text-sm"
            >
              <Checkbox
                checked={value.includes(ch)}
                disabled={isLocked}
                onCheckedChange={(v) => toggle(ch, v === true)}
              />
              <span className={isLocked ? 'text-on-surface-variant' : ''}>
                {t(CHANNEL_LABEL_KEY[ch])}
              </span>
            </label>
          );
        })}
      </div>
      {lockedOut.length > 0 ? (
        <p className="text-xs text-on-surface-variant">{t('broadcastPage.teacherChannelHint')}</p>
      ) : null}
    </div>
  );
}
