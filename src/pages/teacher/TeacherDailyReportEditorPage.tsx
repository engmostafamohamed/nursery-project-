import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DailyReportForm } from '@/components/teacher/DailyReportForm';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  copyYesterdayReport,
  defaultDailyReportForm,
  hydrateDailyReportFormFromRow,
  loadDailyReport,
} from '@/hooks/dailyReportsSchema';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDailyReports } from '@/hooks/useDailyReports';
import { useUserProfile } from '@/hooks/useUserProfile';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ageFromDob(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years -= 1;
  return Math.max(0, years);
}

export function TeacherDailyReportEditorPage() {
  const { t, i18n } = useTranslation();
  const { childId: childIdParam, date: dateParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const reports = useDailyReports({ userId: user?.id, nurseryId: profile?.nursery_id ?? undefined });

  const [form, setForm] = useState(defaultDailyReportForm);
  const [sameForAllChildren, setSameForAllChildren] = useState(false);

  const validParams = Boolean(childIdParam && dateParam && UUID_RE.test(childIdParam) && DATE_RE.test(dateParam));

  const allowedChildIds = useMemo(() => new Set(reports.children.map((c) => c.id)), [reports.children]);
  const childAllowed = childIdParam ? allowedChildIds.has(childIdParam) : false;

  const childOptions = useMemo(
    () =>
      reports.children.map((c) => ({
        id: c.id,
        name: i18n.language === 'ar' ? c.full_name_ar : c.full_name_en,
        ageYears: ageFromDob(c.dob),
      })),
    [reports.children, i18n.language],
  );

  const loadExisting = useCallback(async (childId: string, date: string) => {
    const row = await loadDailyReport(childId, date);
    setForm((prev) => hydrateDailyReportFormFromRow(row, { ...prev, childId, reportDate: date }));
  }, []);

  useEffect(() => {
    if (!validParams || !childIdParam || !dateParam || !childAllowed) return;
    void loadExisting(childIdParam, dateParam);
  }, [validParams, childIdParam, dateParam, childAllowed, loadExisting]);

  const validate = () => {
    if (!form.childId) {
      toast.error(t('reports.daily.validation.childRequired'));
      return false;
    }
    return true;
  };

  const saveDraft = async () => {
    if (!validate()) return;
    await reports.upsertReport({ form, status: 'draft' });
    toast.success(t('reports.daily.savedDraft'));
  };

  const publish = async () => {
    if (!validate()) return;
    await reports.upsertReport({ form, status: 'published' });
    toast.success(t('reports.daily.published'));
    navigate('/teacher/daily-reports');
  };

  if (!validParams) {
    return (
      <div className="space-y-4 pb-28">
        <p className="text-sm text-on-surface-variant">{t('reports.daily.invalidRoute')}</p>
        <Button asChild variant="outline">
          <Link to="/teacher/daily-reports">{t('reports.daily.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (!childAllowed) {
    return (
      <div className="space-y-4 pb-28">
        <p className="text-sm text-on-surface-variant">{t('reports.daily.childNotInClass')}</p>
        <Button asChild variant="outline">
          <Link to="/teacher/daily-reports">{t('reports.daily.backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl lg:max-w-none space-y-4 pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/teacher/daily-reports">
            <MaterialSymbol name="arrow_back" size="text-lg" />
            {t('reports.daily.backToList')}
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <MaterialSymbol name="edit_note" className="text-primary" size="text-2xl" />
        <h1 className="text-lg font-semibold text-on-surface">{t('reports.daily.createTitle')}</h1>
      </div>
      <DailyReportForm
        value={form}
        children={childOptions}
        sameForAllChildren={sameForAllChildren}
        onToggleSameForAll={setSameForAllChildren}
        onChange={(next) => {
          const childChanged = next.childId !== form.childId;
          const dateChanged = next.reportDate !== form.reportDate;
          setForm(next);
          if (next.childId && next.reportDate && (childChanged || dateChanged)) {
            navigate(`/teacher/daily-reports/${next.childId}/${next.reportDate}`, { replace: true });
          }
        }}
        onSaveDraft={saveDraft}
        onPublish={publish}
        onCopyFromYesterday={async () => {
          if (!form.childId) return;
          const row = await copyYesterdayReport(form.childId, form.reportDate);
          if (!row) {
            toast.message(t('reports.daily.noYesterdayData'));
            return;
          }
          setForm((prev) => hydrateDailyReportFormFromRow(row, prev));
          toast.success(t('reports.daily.copiedYesterday'));
        }}
        isSaving={reports.isSaving}
      />
    </div>
  );
}
