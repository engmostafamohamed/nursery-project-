import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CompletionBar } from '@/components/daily-reports/CompletionBar';
import { DailyReportQuestions } from '@/components/daily-reports/DailyReportQuestions';
import { DailyReportSheet } from '@/components/daily-reports/DailyReportSheet';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChildFoodAlerts } from '@/features/food-and-beverage/ChildFoodAlerts';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAutosave } from '@/hooks/useAutosave';
import {
  useDailyReportRow,
  useMyDailyReports,
  useRefreshMyDailyReports,
  useSaveDailyReport,
  useSendDailyReports,
} from '@/hooks/useDailyReportWorkflow';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { completion, dailyReportErrorKey, fromRow, nextChild, toPayload, type DailyReportAnswers, type SaveResult } from '@/lib/dailyReport';
import type { DailyReportCard } from '@/lib/dailyReportCard';
import { ATTENDANCE_TONE, attendanceName, questionList, questionName } from '@/lib/dailyReportLabels';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A report can still be written up to seven days later (save_daily_report's limit). */
const EDITABLE_DAYS = 7;

function ageInYears(dob: string | null): number {
  if (!dob) return 99;
  const d = new Date(`${dob}T12:00:00`);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return Math.max(0, years);
}

/** /teacher/daily-reports/:childId/:date — one child's report for one day. */
export function TeacherDailyReportEditorPage() {
  const { t } = useTranslation();
  const { childId, date } = useParams();
  if (!childId || !date || !UUID_RE.test(childId) || !DATE_RE.test(date)) {
    return (
      <EmptyState
        icon="link_off"
        title={t('reports.daily.invalidRoute')}
        description={t('dailyReport.editor.invalidRouteHint')}
        action={
          <Button asChild variant="outline">
            <Link to="/teacher/daily-reports">{t('reports.daily.backToList')}</Link>
          </Button>
        }
      />
    );
  }
  // A new editor per child and day: what is left unsaved is saved when moving to the next child.
  return <ReportEditor key={`${childId}|${date}`} childId={childId} day={date} />;
}

function ReportEditor({ childId, day }: { childId: string; day: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const dayQuery = useMyDailyReports(user?.id, day);
  const rowQuery = useDailyReportRow(user?.id, childId, day);
  const { nurseryId } = useSettings();
  const save = useSaveDailyReport();
  const send = useSendDailyReports(user?.id);
  const refreshDay = useRefreshMyDailyReports(user?.id);

  const [answers, setAnswers] = useState<DailyReportAnswers | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  // The id a save just returned, for sending right after it (state is only seen on the next render).
  const savedId = useRef<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: profile } = useUserProfile(user?.id);

  // Filled once from the saved report; later refetches must not overwrite what is being typed.
  if (rowQuery.isSuccess && answers === null) {
    const row = rowQuery.data;
    setAnswers(fromRow(row));
    setReportId(row ? String(row.id) : null);
    setSentAt(row?.status === 'published' ? String(row.published_at ?? '') || new Date().toISOString() : null);
  }

  const autosave = useAutosave<DailyReportAnswers, SaveResult>(
    (value) => save.mutateAsync({ childId, day, answers: toPayload(value) }),
    {
      onSaved: (result) => {
        savedId.current = result.id;
        setReportId(result.id);
        refreshDay();
      },
    },
  );

  const rows = dayQuery.data ?? [];
  const me = rows.find((r) => r.child_id === childId);
  const today = getNurseryCalendarDateString();
  const tooOld = day < addCalendarDaysYmd(today, -EDITABLE_DAYS) || day > today;
  const readOnly = Boolean(sentAt) || tooOld;
  const done = answers ? completion(answers) : null;
  const previous = nextChild(rows, childId, -1);
  const next = nextChild(rows, childId, 1);
  const name = me ? (localName(me.full_name_ar, me.full_name_en, lang.startsWith('ar'))) || '—' : '';
  const className = me ? (localName(me.class_name_ar, me.class_name_en, lang.startsWith('ar'))) : '';
  const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
  const listLink = `/teacher/daily-reports${day === today ? '' : `?date=${day}`}`;

  const change = (value: DailyReportAnswers) => {
    if (readOnly) return;
    setAnswers(value);
    setSendError(null);
    autosave.change(value);
  };

  const sendNow = async () => {
    if (!done || done.missing.length || readOnly) return;
    setSendError(null);
    if (!(await autosave.flush())) return;
    const id = savedId.current ?? reportId;
    if (!id) return;
    const ok = await confirm({
      title: t('dailyReport.editor.sendTitle', { name }),
      description: t('dailyReport.editor.sendBody'),
      confirmText: t('dailyReport.editor.send'),
      icon: 'send',
    });
    if (!ok) return;
    try {
      const result = await send.mutateAsync([id]);
      if (result.sent_count > 0 || result.already_sent > 0) {
        setSentAt(new Date().toISOString());
        toast.success(t('dailyReport.editor.sentToast', { name }));
      } else if (result.incomplete.length) {
        setSendError(t('dailyReport.editor.stillMissing', { questions: questionList(t, result.incomplete[0].missing, lang) }));
      }
    } catch (error) {
      setSendError(t(`dailyReport.errors.${dailyReportErrorKey(error)}`));
    }
  };

  const goTo = (id: string) => navigate(`/teacher/daily-reports/${id}/${day}`);

  if (dayQuery.isPending || rowQuery.isPending || !answers) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        {[1, 2, 3].map((k) => <Skeleton key={k} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!me) {
    return (
      <EmptyState
        icon="person_off"
        title={t('reports.daily.childNotInClass')}
        description={t('dailyReport.editor.notInClassHint')}
        action={
          <Button asChild variant="outline">
            <Link to={listLink}>{t('reports.daily.backToList')}</Link>
          </Button>
        }
      />
    );
  }

  // The report as the family will receive it, from what is filled in now, sent by this teacher.
  const preview: DailyReportCard = {
    id: reportId,
    childId,
    childNameAr: me.full_name_ar,
    childNameEn: me.full_name_en,
    avatarUrl: me.avatar_url,
    childCode: me.child_code,
    classNameAr: me.class_name_ar,
    classNameEn: me.class_name_en,
    reportDate: day,
    publishedAt: sentAt,
    sender: profile
      ? {
          sender_name_ar: profile.name_ar,
          sender_name_en: profile.name_en,
          sender_role: profile.role,
          sender_role_title_ar: null,
          sender_role_title_en: null,
          sender_department: profile.department ?? null,
          sender_class_names_ar: me.class_name_ar,
          sender_class_names_en: me.class_name_en,
          sender_class_role: null,
        }
      : null,
    answers,
  };

  const saveLine =
    autosave.status === 'saving'
      ? t('dailyReport.editor.saving')
      : autosave.status === 'dirty'
        ? t('dailyReport.editor.unsaved')
        : autosave.status === 'error'
          ? t(`dailyReport.errors.${dailyReportErrorKey(autosave.error)}`)
          : autosave.savedAt
            ? t('dailyReport.editor.savedAt', { time: time(autosave.savedAt.toISOString()) })
            : me.last_saved_at
              ? t('dailyReport.editor.savedAt', { time: time(me.last_saved_at) })
              : t('dailyReport.editor.notSavedYet');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-32">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={listLink}>
            <MaterialSymbol name="arrow_back" className="text-lg rtl:rotate-180" />
            {t('reports.daily.backToList')}
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!previous} onClick={() => previous && goTo(previous.child_id)}>
            <MaterialSymbol name="chevron_left" className="me-1 text-lg rtl:rotate-180" />
            {t('dailyReport.editor.previousChild')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!next} onClick={() => next && goTo(next.child_id)}>
            {t('dailyReport.editor.nextChild')}
            <MaterialSymbol name="chevron_right" className="ms-1 text-lg rtl:rotate-180" />
          </Button>
        </div>
      </div>

      {/* The child and the day */}
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 bg-surface-container-lowest p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
              {name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">
                {new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="font-headline text-2xl font-extrabold text-on-surface">{t('dailyReport.editor.title', { name })}</h1>
              <p className="text-sm text-on-surface-variant">
                {[className, me.child_code].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={ATTENDANCE_TONE[me.attendance]}>
              {attendanceName(t, me.attendance)}
              {me.check_in ? ` · ${time(me.check_in)}` : ''}
              {me.check_out ? ` – ${time(me.check_out)}` : ''}
            </StatusPill>
            {sentAt ? (
              <StatusPill tone="success" icon="mark_email_read">{t('dailyReport.editor.sentAt', { time: time(sentAt) })}</StatusPill>
            ) : null}
          </div>
        </div>
        {readOnly ? (
          <p className="flex items-center gap-2 border-t border-outline-variant px-4 py-3 text-sm text-on-surface-variant sm:px-5">
            <MaterialSymbol name="lock" className="text-base" />
            {sentAt ? t('dailyReport.editor.lockedSent') : t('dailyReport.editor.lockedOld')}
          </p>
        ) : null}
      </section>

      <ChildFoodAlerts nurseryId={nurseryId} childId={childId} day={day} menuPath="/teacher/meals" />
      <DailyReportQuestions value={answers} onChange={change} missing={done?.missing ?? []} readOnly={readOnly} showFeeding={ageInYears(me.dob) < 2} />

      {/* Progress, saving and sending: stays at the bottom of the screen */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-outline-variant bg-surface/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <CompletionBar
              percent={done?.percent ?? 0}
              label={t('dailyReport.editor.progressLabel')}
              detail={t('dailyReport.editor.answeredOf', { answered: done?.answered ?? 0, required: done?.required ?? 7 })}
              className="max-w-md"
            />
            {!readOnly && done && done.missing.length ? (
              <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-warning">
                <span className="font-semibold">{t('dailyReport.editor.toAnswer')}</span>
                {done.missing.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="underline underline-offset-2 hover:text-on-surface"
                    onClick={() => document.getElementById(`q-${q}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  >
                    {questionName(t, q)}
                  </button>
                ))}
              </p>
            ) : null}
            {sendError ? <p role="alert" className="text-xs text-error">{sendError}</p> : null}
          </div>
          <Button type="button" variant="ghost" onClick={() => setPreviewOpen(true)}>
            <MaterialSymbol name="visibility" className="me-1 text-base" />
            {t('dailyReport.editor.preview')}
          </Button>
          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-live="polite"
                className={cn('inline-flex items-center gap-1 text-xs', autosave.status === 'error' ? 'text-error' : 'text-on-surface-variant')}
              >
                <MaterialSymbol
                  name={autosave.status === 'saving' ? 'sync' : autosave.status === 'error' ? 'cloud_off' : autosave.status === 'dirty' ? 'edit' : 'cloud_done'}
                  className={cn('text-base', autosave.status === 'saving' && 'animate-spin')}
                />
                {saveLine}
              </span>
              <Button type="button" variant="outline" disabled={autosave.status === 'saving'} onClick={() => void autosave.flush()}>
                <MaterialSymbol name="save" className="me-1 text-base" />
                {t('dailyReport.editor.saveChanges')}
              </Button>
              <Button type="button" disabled={!done || done.missing.length > 0 || send.isPending} onClick={() => void sendNow()}>
                <MaterialSymbol name="send" className="me-1 text-base rtl:rotate-180" />
                {send.isPending ? t('dailyReport.editor.sending') : t('dailyReport.editor.send')}
              </Button>
            </div>
          ) : next ? (
            <Button type="button" onClick={() => goTo(next.child_id)}>
              {t('dailyReport.editor.nextChild')}
              <MaterialSymbol name="chevron_right" className="ms-1 text-lg rtl:rotate-180" />
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0 sm:p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('dailyReport.editor.previewTitle')}</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <div className="p-3 sm:p-5">
            <DailyReportSheet card={preview} preview={!sentAt} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
