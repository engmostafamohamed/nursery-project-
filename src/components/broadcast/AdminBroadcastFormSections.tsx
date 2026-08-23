import { useTranslation } from 'react-i18next';

import { BroadcastChannelCheckboxes } from '@/components/broadcast/BroadcastChannelCheckboxes';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { UserRole } from '@/types/enums';
import type { BroadcastChannel } from '@/types/tables/batch3';

export type AudienceMode = 'all_parents' | 'class' | 'role';

type ClassRow = { id: string; name_ar: string; name_en: string };

type Props = {
  audienceMode: AudienceMode;
  onAudienceMode: (v: AudienceMode) => void;
  classId: string;
  onClassId: (v: string) => void;
  rolePick: UserRole;
  onRolePick: (v: UserRole) => void;
  classes: ClassRow[];
  classLabel: (row: ClassRow) => string;
  contentAr: string;
  onContentAr: (v: string) => void;
  contentEn: string;
  onContentEn: (v: string) => void;
  channels: BroadcastChannel[];
  onChannels: (v: BroadcastChannel[]) => void;
  sendMode: 'now' | 'later';
  onSendMode: (v: 'now' | 'later') => void;
  scheduledLocal: string;
  onScheduledLocal: (v: string) => void;
  onPreview: () => void;
  onSubmit: () => void;
  submitPending: boolean;
  submitDisabled: boolean;
};

export function AdminBroadcastFormSections({
  audienceMode,
  onAudienceMode,
  classId,
  onClassId,
  rolePick,
  onRolePick,
  classes,
  classLabel,
  contentAr,
  onContentAr,
  contentEn,
  onContentEn,
  channels,
  onChannels,
  sendMode,
  onSendMode,
  scheduledLocal,
  onScheduledLocal,
  onPreview,
  onSubmit,
  submitPending,
  submitDisabled,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2">
          <Label>{t('broadcastPage.audienceLabel')}</Label>
          <select
            className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
            value={audienceMode}
            onChange={(e) => onAudienceMode(e.target.value as AudienceMode)}
          >
            <option value="all_parents">{t('broadcastPage.audienceAllParents')}</option>
            <option value="class">{t('broadcastPage.audienceClass')}</option>
            <option value="role">{t('broadcastPage.audienceRole')}</option>
          </select>
        </div>

        {audienceMode === 'class' ? (
          <div className="space-y-2">
            <Label>{t('broadcastPage.selectClass')}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={classId}
              onChange={(e) => onClassId(e.target.value)}
            >
              <option value="">{t('broadcastPage.selectClass')}</option>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {classLabel(row)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {audienceMode === 'role' ? (
          <div className="space-y-2">
            <Label>{t('broadcastPage.selectRole')}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={rolePick}
              onChange={(e) => onRolePick(e.target.value as UserRole)}
            >
              <option value="parent">{t('broadcastPage.roleParent')}</option>
              <option value="teacher">{t('broadcastPage.roleTeacher')}</option>
              <option value="branch_admin">{t('broadcastPage.roleBranchAdmin')}</option>
            </select>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="bc-ar">{t('broadcastPage.contentAr')}</Label>
          <Textarea
            id="bc-ar"
            value={contentAr}
            onChange={(e) => onContentAr(e.target.value)}
            placeholder={t('broadcastPage.contentArPlaceholder')}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-en">{t('broadcastPage.contentEn')}</Label>
          <Textarea
            id="bc-en"
            value={contentEn}
            onChange={(e) => onContentEn(e.target.value)}
            placeholder={t('broadcastPage.contentEnPlaceholder')}
            rows={4}
          />
        </div>

        <BroadcastChannelCheckboxes value={channels} onChange={onChannels} />

        <div className="space-y-2">
          <Label>{t('broadcastPage.scheduleLabel')}</Label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bc-mode"
                checked={sendMode === 'now'}
                onChange={() => onSendMode('now')}
                className="accent-primary"
              />
              {t('broadcastPage.sendNow')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="bc-mode"
                checked={sendMode === 'later'}
                onChange={() => onSendMode('later')}
                className="accent-primary"
              />
              {t('broadcastPage.sendLater')}
            </label>
          </div>
          {sendMode === 'later' ? (
            <input
              type="datetime-local"
              className="h-11 w-full max-w-xs rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={scheduledLocal}
              onChange={(e) => onScheduledLocal(e.target.value)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onPreview}
            disabled={!contentAr.trim() && !contentEn.trim()}
          >
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>
              visibility
            </span>
            {t('broadcastPage.preview')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitPending || submitDisabled}>
            {sendMode === 'later' ? t('broadcastPage.scheduleSave') : t('broadcastPage.send')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
