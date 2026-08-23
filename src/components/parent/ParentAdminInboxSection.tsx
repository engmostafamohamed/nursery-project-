import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentInAppNotifications } from '@/hooks/useParentInAppNotifications';
import type { SurveyType } from '@/hooks/useSurveys';
import { useSurveys } from '@/hooks/useSurveys';
import { useUserProfile } from '@/hooks/useUserProfile';
import { resolveParentNotificationPath } from '@/lib/parentNotificationUtils';

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

/**
 * Single inbox surfacing anything an admin pushed to this parent: pending
 * permissions/questionnaires plus high-urgency notifications. Renders compactly
 * at the top of the parent dashboard so the parent can't miss a deadline.
 */
export function ParentAdminInboxSection() {
  const { t, i18n } = useTranslation();
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
    () => (notifQuery.data ?? []).filter((n) => n.urgency === 'high' && !n.read).slice(0, 3),
    [notifQuery.data],
  );

  if (
    permissions.length === 0 &&
    questionnaires.length === 0 &&
    urgentNotifications.length === 0
  ) {
    return null;
  }

  return (
    <section className="space-y-3">
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

      <div className="space-y-2">
        {urgentNotifications.map((n) => (
          <Link
            key={n.id}
            to={resolveParentNotificationPath(n.type, n.action_link)}
            className="flex items-start gap-3 rounded-2xl border border-error/60 bg-error/5 p-4 ring-1 ring-error/40 transition-colors hover:bg-error/10"
          >
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-error" aria-hidden>
              priority_high
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-on-surface">
                  {i18n.language === 'ar' ? n.title_ar : n.title_en}
                </p>
                <Badge className="border-error bg-error/10 text-error text-[10px]">
                  {t('parent.dashboard.adminInbox.urgentBadge')}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-on-surface-variant">
                {i18n.language === 'ar' ? n.body_ar : n.body_en}
              </p>
            </div>
          </Link>
        ))}

        {permissions.map((s) => {
          const sDeadline = s.deadline ? String(s.deadline) : null;
          const urgent = deadlineUrgent(sDeadline);
          const title = String(s.title ?? s.title_ar ?? s.title_en ?? '-');
          return (
            <Link
              key={String(s.id)}
              to="/parent/surveys"
              className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
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
              className="flex items-start gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container-low"
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
