import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  fetchReportGrades,
  useAdminQuarterlyReports,
  useQuarterlyTemplate,
  type QuarterlyReportRow,
} from '@/hooks/useQuarterlyReports';

type View = 'home' | 'template' | 'editor';

export function AdminReportsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const tpl = useQuarterlyTemplate(nurseryId);
  const reports = useAdminQuarterlyReports(nurseryId);
  const { data: children = [] } = useNurseryChildrenPicker(nurseryId);

  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<QuarterlyReportRow | null>(null);

  const template = tpl.query.data;

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-xl font-semibold text-on-surface">{t('reports.title')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('reports.subtitle')}</p>
      </header>

      {view === 'home' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
            <span className="material-symbols-outlined text-3xl text-primary" aria-hidden>
              today
            </span>
            <h2 className="mt-2 text-base font-semibold text-on-surface">
              {t('reports.dailyTitle')}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">{t('reports.dailyDesc')}</p>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
            <span className="material-symbols-outlined text-3xl text-primary" aria-hidden>
              grading
            </span>
            <h2 className="mt-2 text-base font-semibold text-on-surface">
              {t('reports.quarterlyTitle')}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">{t('reports.quarterlyDesc')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setView('template')}>
                {t('reports.manageTemplate')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!template || template.sections.length === 0}
                onClick={() => {
                  setEditing(null);
                  setView('editor');
                }}
              >
                {t('reports.newReport')}
              </Button>
            </div>
            {!template || template.sections.length === 0 ? (
              <p className="mt-2 text-xs text-warning">{t('reports.needTemplateFirst')}</p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <h3 className="mb-2 text-sm font-semibold text-on-surface">
              {t('reports.existingReports')}
            </h3>
            {reports.query.isPending ? (
              <LoadingSkeleton />
            ) : (reports.query.data ?? []).length === 0 ? (
              <EmptyState
                icon="grading"
                title={t('reports.noReportsTitle')}
                description={t('reports.noReportsDesc')}
              />
            ) : (
              <div className="space-y-2">
                {(reports.query.data ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        {isAr ? r.childNameAr || r.childNameEn : r.childNameEn || r.childNameAr} ·{' '}
                        {r.term_label}
                      </p>
                      <span
                        className={
                          'mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ' +
                          (r.status === 'sent'
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-warning/30 bg-warning/10 text-warning')
                        }
                      >
                        {r.status === 'sent' ? t('reports.statusSent') : t('reports.statusDraft')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(r);
                          setView('editor');
                        }}
                      >
                        {r.status === 'sent' ? t('common.edit') : t('reports.continue')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={reports.deleteReport.isPending}
                        onClick={async () => {
                          try {
                            await reports.deleteReport.mutateAsync(r.id);
                            toast.success(t('reports.deleted'));
                          } catch {
                            toast.error(t('reports.saveFailed'));
                          }
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'template' && (
        <TemplateBuilder tpl={tpl} isAr={isAr} onBack={() => setView('home')} />
      )}

      {view === 'editor' && template && (
        <ReportEditor
          template={template}
          children={children}
          isAr={isAr}
          existing={editing}
          onSave={async (payload) => {
            try {
              await reports.saveReport.mutateAsync(payload);
              toast.success(payload.send ? t('reports.sentToParents') : t('reports.savedDraft'));
              setView('home');
            } catch {
              toast.error(t('reports.saveFailed'));
            }
          }}
          onBack={() => setView('home')}
          saving={reports.saveReport.isPending}
        />
      )}
    </div>
  );
}

function TemplateBuilder({
  tpl,
  isAr,
  onBack,
}: {
  tpl: ReturnType<typeof useQuarterlyTemplate>;
  isAr: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const template = tpl.query.data;

  const ensure = async (): Promise<string> => {
    if (template) return template.id;
    return tpl.ensureTemplate.mutateAsync();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-on-surface">{t('reports.templateTitle')}</h2>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>

      {!template ? (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="text-sm text-on-surface-variant">{t('reports.noTemplateYet')}</p>
          <Button
            type="button"
            className="mt-3"
            disabled={tpl.ensureTemplate.isPending}
            onClick={() => void tpl.ensureTemplate.mutateAsync()}
          >
            {t('reports.createTemplate')}
          </Button>
        </div>
      ) : (
        <>
          {/* Grade scale */}
          <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <h3 className="text-sm font-semibold text-on-surface">{t('reports.gradeScale')}</h3>
            <div className="mt-3 space-y-2">
              {template.gradeLevels.map((g) => (
                <div key={g.id} className="flex items-center gap-2 text-sm">
                  <span className="w-8 rounded bg-primary/10 px-2 py-0.5 text-center font-semibold text-primary">
                    {g.code}
                  </span>
                  <span className="flex-1">{isAr ? g.label_ar : g.label_en}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void tpl.deleteGradeLevel.mutateAsync(g.id)}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
            </div>
            <AddGradeRow
              onAdd={async (code, en, ar) => {
                const id = await ensure();
                await tpl.addGradeLevel.mutateAsync({
                  templateId: id,
                  code,
                  label_en: en,
                  label_ar: ar,
                  sort_order: template.gradeLevels.length,
                });
              }}
            />
          </section>

          {/* Sections + items */}
          <section className="space-y-3">
            {template.sections.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-on-surface">
                    {isAr ? s.title_ar || s.title_en : s.title_en || s.title_ar}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void tpl.deleteSection.mutateAsync(s.id)}
                  >
                    {t('reports.deleteSection')}
                  </Button>
                </div>
                <ul className="mt-2 space-y-1">
                  {s.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-on-surface-variant">
                        {isAr ? it.label_ar || it.label_en : it.label_en || it.label_ar}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void tpl.deleteItem.mutateAsync(it.id)}
                      >
                        {t('common.delete')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <AddItemRow
                  onAdd={async (en, ar) => {
                    await tpl.addItem.mutateAsync({
                      sectionId: s.id,
                      templateId: template.id,
                      label_en: en,
                      label_ar: ar,
                      sort_order: s.items.length,
                    });
                  }}
                />
              </div>
            ))}
            <AddSectionRow
              onAdd={async (en, ar) => {
                const id = await ensure();
                await tpl.addSection.mutateAsync({
                  templateId: id,
                  title_en: en,
                  title_ar: ar,
                  sort_order: template.sections.length,
                });
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}

function TwoInputRow({
  placeholderEn,
  placeholderAr,
  extra,
  onAdd,
  cta,
}: {
  placeholderEn: string;
  placeholderAr: string;
  extra?: { value: string; set: (v: string) => void; placeholder: string };
  onAdd: (en: string, ar: string) => Promise<void>;
  cta: string;
}) {
  const [en, setEn] = useState('');
  const [ar, setAr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {extra ? (
        <input
          value={extra.value}
          onChange={(e) => extra.set(e.target.value)}
          placeholder={extra.placeholder}
          className="h-9 w-16 rounded-lg border border-outline-variant bg-surface px-2 text-sm"
        />
      ) : null}
      <input
        value={en}
        onChange={(e) => setEn(e.target.value)}
        placeholder={placeholderEn}
        className="h-9 min-w-[140px] flex-1 rounded-lg border border-outline-variant bg-surface px-3 text-sm"
      />
      <input
        dir="rtl"
        value={ar}
        onChange={(e) => setAr(e.target.value)}
        placeholder={placeholderAr}
        className="h-9 min-w-[140px] flex-1 rounded-lg border border-outline-variant bg-surface px-3 text-sm"
      />
      <Button
        type="button"
        size="sm"
        disabled={busy || (!en.trim() && !ar.trim())}
        onClick={async () => {
          setBusy(true);
          try {
            await onAdd(en.trim(), ar.trim());
            setEn('');
            setAr('');
          } finally {
            setBusy(false);
          }
        }}
      >
        {cta}
      </Button>
    </div>
  );
}

function AddGradeRow({ onAdd }: { onAdd: (code: string, en: string, ar: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  return (
    <TwoInputRow
      placeholderEn={t('reports.gradeLabelEn')}
      placeholderAr={t('reports.gradeLabelAr')}
      extra={{ value: code, set: setCode, placeholder: t('reports.gradeCode') }}
      cta={t('reports.addGrade')}
      onAdd={async (en, ar) => {
        if (!code.trim()) return;
        await onAdd(code.trim(), en, ar);
        setCode('');
      }}
    />
  );
}

function AddSectionRow({ onAdd }: { onAdd: (en: string, ar: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <TwoInputRow
      placeholderEn={t('reports.sectionEn')}
      placeholderAr={t('reports.sectionAr')}
      cta={t('reports.addSection')}
      onAdd={onAdd}
    />
  );
}

function AddItemRow({ onAdd }: { onAdd: (en: string, ar: string) => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <TwoInputRow
      placeholderEn={t('reports.itemEn')}
      placeholderAr={t('reports.itemAr')}
      cta={t('reports.addItem')}
      onAdd={onAdd}
    />
  );
}

function ReportEditor({
  template,
  children,
  isAr,
  existing,
  onSave,
  onBack,
  saving,
}: {
  template: NonNullable<ReturnType<typeof useQuarterlyTemplate>['query']['data']>;
  children: { id: string; full_name_en: string; full_name_ar: string }[];
  isAr: boolean;
  existing: QuarterlyReportRow | null;
  onSave: (p: {
    reportId?: string;
    templateId: string;
    childId: string;
    termLabel: string;
    periodFrom: string | null;
    periodTo: string | null;
    attendancePresent: number | null;
    attendanceTotal: number | null;
    comment: string;
    grades: Record<string, string>;
    send: boolean;
  }) => Promise<void>;
  onBack: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [childId, setChildId] = useState(existing?.child_id ?? '');
  const [term, setTerm] = useState(existing?.term_label ?? 'Term 1');
  const [from, setFrom] = useState(existing?.period_from ?? '');
  const [to, setTo] = useState(existing?.period_to ?? '');
  const [present, setPresent] = useState('');
  const [total, setTotal] = useState('');
  const [comment, setComment] = useState('');
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!existing);

  useEffect(() => {
    if (existing && !loaded) {
      void fetchReportGrades(existing.id).then((g) => {
        setGrades(g);
        setLoaded(true);
      });
    }
  }, [existing, loaded]);

  const submit = (send: boolean) => {
    if (!childId) {
      toast.error(t('reports.pickChild'));
      return;
    }
    void onSave({
      reportId: existing?.id,
      templateId: template.id,
      childId,
      termLabel: term.trim() || 'Term 1',
      periodFrom: from || null,
      periodTo: to || null,
      attendancePresent: present ? Number(present) : null,
      attendanceTotal: total ? Number(total) : null,
      comment,
      grades,
      send,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-on-surface">{t('reports.fillTitle')}</h2>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-xs text-on-surface-variant">{t('reports.child')}</span>
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            disabled={Boolean(existing)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm disabled:opacity-60"
          >
            <option value="">{t('reports.selectChild')}</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {isAr ? c.full_name_ar || c.full_name_en : c.full_name_en || c.full_name_ar}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-on-surface-variant">{t('reports.term')}</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-on-surface-variant">{t('reports.from')}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-on-surface-variant">{t('reports.to')}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-on-surface-variant">
            {t('reports.attendancePresent')}
          </span>
          <input
            type="number"
            value={present}
            onChange={(e) => setPresent(e.target.value)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-on-surface-variant">
            {t('reports.attendanceTotal')}
          </span>
          <input
            type="number"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm"
          />
        </label>
      </div>

      {template.sections.map((s) => (
        <section
          key={s.id}
          className="overflow-hidden rounded-2xl border border-outline-variant"
        >
          <div className="bg-success/15 px-4 py-2 text-sm font-semibold text-on-surface">
            {isAr ? s.title_ar || s.title_en : s.title_en || s.title_ar}
          </div>
          <div className="divide-y divide-outline-variant">
            {s.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 text-sm text-on-surface">
                  {isAr ? it.label_ar || it.label_en : it.label_en || it.label_ar}
                </span>
                <select
                  value={grades[it.id] ?? ''}
                  onChange={(e) =>
                    setGrades((g) => ({ ...g, [it.id]: e.target.value }))
                  }
                  className="h-9 rounded-lg border border-outline-variant bg-surface px-2 text-sm"
                >
                  <option value="">—</option>
                  {template.gradeLevels.map((g) => (
                    <option key={g.id} value={g.code}>
                      {g.code}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      ))}

      <label className="block">
        <span className="mb-1 block text-xs text-on-surface-variant">{t('reports.comment')}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[100px] w-full rounded-xl border border-outline-variant bg-surface p-3 text-sm"
        />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={() => submit(false)}>
          {t('reports.saveDraft')}
        </Button>
        <Button type="button" disabled={saving} onClick={() => submit(true)}>
          {t('reports.sendToParents')}
        </Button>
      </div>
    </div>
  );
}
