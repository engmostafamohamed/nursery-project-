import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  parentInAppNotificationsQueryKey,
  useParentInAppNotifications,
} from '@/hooks/useParentInAppNotifications';
import type { ParentInAppNotificationRow } from '@/hooks/useParentInAppNotifications';
import type { SurveyType } from '@/hooks/useSurveys';
import { useSurveys } from '@/hooks/useSurveys';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  formatNotificationRelativeTime,
  parentNotificationMaterialIcon,
  resolveParentNotificationPath,
} from '@/lib/parentNotificationUtils';
import { supabase } from '@/lib/supabase';

function deadlineUrgent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 && ms < 48 * 60 * 60 * 1000;
}

function formatDeadline(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short', hour12: true,
    });
  } catch {
    return iso;
  }
}

type GroupedNotification = {
  item: ParentInAppNotificationRow;
  count: number;
};

function notificationGroupKey(item: ParentInAppNotificationRow, lang: string): string {
  const title = lang === 'ar' ? item.title_ar : item.title_en;
  const body = lang === 'ar' ? item.body_ar : item.body_en;
  return [item.type, item.action_link ?? '', title, body].join('|');
}

/**
 * Single inbox surfacing anything an admin pushed to this parent: pending
 * permissions/questionnaires plus high-urgency notifications. Renders compactly
 * at the top of the parent dashboard so the parent can't miss a deadline.
 */
export function ParentAdminInboxSection() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const surveys = useSurveys({ nurseryId, parentId: user?.id });
  const notifQuery = useParentInAppNotifications(user?.id);

  const pending = useMemo(() => surveys.parentPendingSurveys ?? [], [surveys.parentPendingSurveys]);

  const permissions = useMemo(
    () =>
      pending
        .filter((s) => ((s.type as SurveyType | undefined) ?? 'questionnaire') === 'permission')
        .sort((a, b) => {
          const aD = a.deadline ? new Date(String(a.deadline)).getTime() : Infinity;
          const bD = b.deadline ? new Date(String(b.deadline)).getTime() : Infinity;
          return aD - bD;
        }),
    [pending],
  );

  const questionnaires = useMemo(
    () =>
      pending.filter(
        (s) => ((s.type as SurveyType | undefined) ?? 'questionnaire') === 'questionnaire',
      ),
    [pending],
  );

  const urgentNotifications = useMemo(
    () => {
      const grouped = new Map<string, GroupedNotification>();
      for (const item of (notifQuery.data ?? []).filter((n) => n.urgency === 'high' && !n.read)) {
        const key = notificationGroupKey(item, i18n.language);
        const current = grouped.get(key);
        grouped.set(key, current ? { item: current.item, count: current.count + 1 } : { item, count: 1 });
      }
      return Array.from(grouped.values()).slice(0, 3);
    },
    [i18n.language, notifQuery.data],
  );

  if (
    permissions.length === 0 &&
    questionnaires.length === 0 &&
    urgentNotifications.length === 0
  ) {
    return null;
  }

  const markNotificationRead = (notificationId: string) => {
    if (!user?.id) return;
    void supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: parentInAppNotificationsQueryKey(user.id) });
      });
  };

  return (
    <section className="flex h-full min-h-[150px] flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-on-surface">
          {t('parent.dashboard.adminInbox.title')}
        </h2>
        <Link
          to="/parent/inbox"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('parent.dashboard.adminInbox.viewAll')}
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
        {urgentNotifications.map(({ item: n, count }) => {
          const title = i18n.language === 'ar' ? n.title_ar : n.title_en;
          const body = i18n.language === 'ar' ? n.body_ar : n.body_en;
          return (
            <Link
              key={n.id}
              to={resolveParentNotificationPath(n.type, n.action_link)}
              onClick={() => markNotificationRead(n.id)}
              className="group flex items-start gap-3 rounded-lg border border-error/30 bg-surface-container-lowest p-4 shadow-sm transition-colors hover:border-error/50 hover:bg-error/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-error/10 text-error">
                <span className="material-symbols-outlined text-xl" aria-hidden>
                  {parentNotificationMaterialIcon(n.type)}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{title}</p>
                  <Badge variant="error" className="text-[10px]">
                    {t('parent.dashboard.adminInbox.urgentBadge')}
                  </Badge>
                  {count > 1 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('parent.dashboard.adminInbox.repeatCount', {
                        count,
                        defaultValue: '{{count}} updates',
                      })}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-5 text-on-surface-variant">{body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-on-surface-variant">
                    {formatNotificationRelativeTime(n.sent_at, i18n.language)}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    {t('common.open', { defaultValue: 'Open' })}
                    <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden>
                      arrow_forward
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          );
        })}

        {permissions.map((s) => {
          const sDeadline = s.deadline ? String(s.deadline) : null;
          const urgent = deadlineUrgent(sDeadline);
          const title = String(s.title ?? s.title_ar ?? s.title_en ?? '-');
          return (
            <Link
              key={String(s.id)}
              to="/parent/surveys"
              className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                urgent
                  ? 'border-error/60 bg-error/5 ring-1 ring-error/40 hover:bg-error/10'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <span
                className={`material-symbols-outlined mt-0.5 shrink-0 text-xl ${
                  urgent ? 'text-error' : 'text-primary'
                }`}
                aria-hidden
              >
                task_alt
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{title}</p>
                  <Badge
                    className={
                      urgent
                        ? 'border-error bg-error/10 text-error text-[10px]'
                        : 'text-[10px]'
                    }
                  >
                    {t(urgent ? 'survey.urgentBadge' : 'survey.permissionBadge')}
                  </Badge>
                </div>
                <p
                  className={`mt-1 text-xs ${urgent ? 'text-error' : 'text-on-surface-variant'}`}
                >
                  {sDeadline
                    ? `${t('survey.deadlineLabel')}: ${formatDeadline(sDeadline, i18n.language)}`
                    : t('parent.dashboard.adminInbox.permissionAwaiting')}
                </p>
              </div>
            </Link>
          );
        })}

        {questionnaires.map((s) => {
          const title = String(s.title ?? s.title_ar ?? s.title_en ?? '-');
          const sDeadline = s.deadline ? String(s.deadline) : null;
          return (
            <Link
              key={String(s.id)}
              to="/parent/surveys"
              className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container-low"
            >
              <span
                className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-primary"
                aria-hidden
              >
                task_alt
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{title}</p>
                  <Badge className="text-[10px]">{t('survey.typeOptions.questionnaire')}</Badge>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {sDeadline
                    ? `${t('survey.deadlineLabel')}: ${formatDeadline(sDeadline, i18n.language)}`
                    : t('parent.dashboard.adminInbox.questionnaireAwaiting')}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
