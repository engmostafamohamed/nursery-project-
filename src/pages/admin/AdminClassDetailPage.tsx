import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { classDraft, classEditorErrorKey, draftIssues, placesAfter, sameDraft, capacityOf, type ClassDraft, type DraftField } from '@/features/class-editor/classEditor';
import { useClassEditor, useSaveClass, useMoveChildren } from '@/features/class-editor/classEditorApi';
import { ChildPickerTable } from '@/features/class-editor/ChildPickerTable';
import { ClassDetailsFields } from '@/features/class-editor/ClassDetailsFields';
import { ClassRosterTable } from '@/features/class-editor/ClassRosterTable';
import { DeleteClassDialog } from '@/features/class-editor/DeleteClassDialog';
import { OverCapacityNote } from '@/features/class-editor/OverCapacityNote';
import { ClassTeamCard } from '@/features/class-team/ClassTeamCard';
import { useClassTeamEditing } from '@/features/class-team/useClassTeamEditing';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useClassTeamActions } from '@/hooks/useClassTeams';
import { pickName } from '@/lib/classTeam';
import { cn } from '@/lib/utils';

/** A titled part of the page. */
function Panel({ icon, title, description, actions, children, testId }: { icon: string; title: string; description?: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm" data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <MaterialSymbol name={icon} size="text-xl" className="mt-0.5 text-primary" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {description ? <p className="text-xs text-on-surface-variant">{description}</p> : null}
          </div>
        </div>
        {actions}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/**
 * Creating a class or changing it.
 *   * New: its details, its lead and backup teacher, and the children who start in it (those without
 *     a class first). Created in one go, then the class's page opens.
 *   * Existing: the details (saved with the bar at the bottom, which shows once something changed),
 *     the team (lead, backup, assistants, nannies: each change saved at once, as on Team & classes),
 *     the children's table (add, move, take out), and deleting the class (its children move first).
 * Every problem shows under its field as it is typed; the database checks the same.
 */
export function AdminClassDetailPage() {
  const { classId: rawClassId } = useParams();
  const isNew = !rawClassId || rawClassId === 'new';
  const classId = isNew ? null : rawClassId ?? null;
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const navigate = useNavigate();
  const base = useAdminBasePath();
  const { activeNurseryId } = useActiveNurseryId();
  const editorQuery = useClassEditor(isNew ? activeNurseryId : null, classId);
  const editor = editorQuery.data;
  const nurseryId = editor?.nurseryId || (isNew ? activeNurseryId : null);
  const team = useClassTeamEditing(nurseryId);
  const { assign } = useClassTeamActions(nurseryId);
  const save = useSaveClass();
  const moveIn = useMoveChildren();

  const [draft, setDraft] = useState<ClassDraft>(() => classDraft(null));
  const [loaded, setLoaded] = useState<ClassDraft | null>(null);
  const [touched, setTouched] = useState<Partial<Record<DraftField, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // New class only: its first team and children.
  const [leadId, setLeadId] = useState('');
  const [backupId, setBackupId] = useState('');
  const [startWith, setStartWith] = useState<Set<string>>(new Set());
  const [overOk, setOverOk] = useState(false);

  // The form follows the class's saved details when they change (a save, another tab), unless
  // something is being typed: children added meanwhile never undo an edit in progress.
  const fresh = editor?.cls ? classDraft(editor.cls) : null;
  if (fresh && (!loaded || !sameDraft(fresh, loaded))) {
    setLoaded(fresh);
    if (!loaded || sameDraft(draft, loaded)) setDraft(fresh);
  }

  const saved = useMemo(() => classDraft(editor?.cls ?? null), [editor?.cls]);
  const issues = draftIssues(draft, editor?.classes ?? []);
  const dirty = isNew ? !sameDraft(draft, saved) || Boolean(leadId || backupId || startWith.size) : !sameDraft(draft, saved);
  const shown = (field: DraftField) => tried || Boolean(touched[field]);
  const teamClass = team.classes.find((c) => c.id === classId) ?? null;
  const activeStaff = team.staff.filter((s) => s.status === 'active');
  const staffName = (s: { name_ar: string | null; name_en: string | null }) => pickName(s, i18n.language);
  const className = editor?.cls ? (isArabic ? editor.cls.nameAr || editor.cls.nameEn : editor.cls.nameEn || editor.cls.nameAr) : '';
  const newPlaces = placesAfter(0, startWith.size, capacityOf(draft));
  const busy = save.isPending || moveIn.isPending || assign.isPending;
  const canSave = isNew ? Boolean(editor?.can.create) : Boolean(editor?.can.update);

  const submit = async () => {
    setTried(true);
    if (Object.keys(issues).length || busy) return;
    if (isNew && newPlaces.over && !overOk) return;
    setProblem(null);
    try {
      const id = await save.mutateAsync({ nurseryId: isNew ? nurseryId : null, id: classId, draft });
      if (!isNew) {
        toast.success(t('classEditor.saved'));
        setTried(false);
        setTouched({});
        return;
      }
      // The class exists now: the team and the children follow, each reported if it fails.
      const troubles: string[] = [];
      for (const [userId, role] of [[leadId, 'lead'], [backupId, 'substitute']] as const) {
        if (!userId) continue;
        try {
          await assign.mutateAsync({ classId: id, userId, role });
        } catch {
          troubles.push(t(role === 'lead' ? 'classEditor.create.leadFailed' : 'classEditor.create.backupFailed'));
        }
      }
      let added = 0;
      if (startWith.size) {
        try {
          added = (await moveIn.mutateAsync({ childIds: [...startWith], classId: id, overCapacityOk: overOk })).moved;
        } catch (error) {
          troubles.push(t(classEditorErrorKey(error)));
        }
      }
      for (const message of troubles) toast.error(message);
      toast.success(added ? t('classEditor.create.doneWithChildren', { count: added }) : t('classEditor.create.done'));
      navigate(`${base}/classes/${id}`, { replace: true });
    } catch (error) {
      setProblem(t(classEditorErrorKey(error)));
    }
  };

  if (editorQuery.isPending && (classId || nurseryId)) return <LoadingSkeleton />;
  if (!isNew && (editorQuery.isError || !editor?.cls)) {
    return <EmptyState icon="school" title={t('admin.classes.detail.notFoundTitle')} description={t('admin.classes.detail.notFoundDescription')} />;
  }
  if (isNew && !nurseryId) {
    return <EmptyState icon="school" title={t('classEditor.noNurseryTitle')} description={t('admin.classes.validation.noActiveNursery')} />;
  }

  const back = isNew ? `${base}/classes` : `${base}/classes/${classId}`;

  return (
    <div className="space-y-5 pb-28" data-testid="class-editor">
      <Link to={back} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
        <MaterialSymbol name="arrow_back" size="text-lg" className="rtl:rotate-180" />
        {isNew ? t('classProfile.backToClasses') : t('classEditor.backToClass', { class: className })}
      </Link>

      <PageHeader
        icon={isNew ? 'add_circle' : 'edit'}
        eyebrow={t('classProfile.eyebrow')}
        title={isNew ? t('classEditor.newTitle') : t('classEditor.editTitle', { class: className })}
        description={isNew ? t('classEditor.newDescription') : t('classEditor.editDescription')}
        actions={!isNew ? (
          <>
            <Button asChild variant="outline" className="gap-1.5">
              <Link to={`${base}/classes/${classId}`}>
                <MaterialSymbol name="visibility" size="text-base" />
                {t('classEditor.openClass')}
              </Link>
            </Button>
            {editor?.can.delete ? (
              <Button type="button" variant="outline" className="gap-1.5 text-error" onClick={() => setDeleting(true)} data-testid="delete-class">
                <MaterialSymbol name="delete" size="text-base" />
                {t('classEditor.delete.button')}
              </Button>
            ) : null}
          </>
        ) : undefined}
      />

      <Panel icon="info" title={t('classEditor.detailsTitle')} description={t('classEditor.detailsDescription')}>
        <ClassDetailsFields
          draft={draft}
          onChange={(patch) => { setDraft((d) => ({ ...d, ...patch })); setProblem(null); }}
          issues={issues}
          shown={shown}
          onBlur={(field) => setTouched((s) => ({ ...s, [field]: true }))}
          gradeLevels={editor?.gradeLevels ?? []}
          childrenCount={isNew ? startWith.size : editor?.children.length ?? 0}
          disabled={!canSave}
        />
      </Panel>

      {isNew ? (
        <>
          <Panel icon="groups" title={t('classEditor.teamTitle')} description={t('classEditor.create.teamDescription')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="new-lead" label={t('classTeam.roles.lead')} optional hint={t('classEditor.create.leadHint')}>
                <Select id="new-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">{t('classEditor.create.noOne')}</option>
                  {activeStaff.filter((s) => s.id !== backupId).map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
                </Select>
              </FormField>
              <FormField id="new-backup" label={t('classTeam.roles.substitute')} optional hint={t('admin.classes.fields.backupHelp')}>
                <Select id="new-backup" value={backupId} onChange={(e) => setBackupId(e.target.value)}>
                  <option value="">{t('classEditor.create.noOne')}</option>
                  {activeStaff.filter((s) => s.id !== leadId).map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
                </Select>
              </FormField>
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">{t('classEditor.create.moreTeamLater')}</p>
          </Panel>

          <Panel
            icon="child_care"
            title={t('classEditor.create.childrenTitle')}
            description={t('classEditor.create.childrenDescription')}
            actions={<span className="rounded-full bg-surface-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">{t('classEditor.add.summary', { count: startWith.size })}</span>}
          >
            <ChildPickerTable candidates={editor?.candidates ?? []} selected={startWith} onChange={setStartWith} today={editor?.today ?? ''} />
            {newPlaces.over ? <div className="mt-3"><OverCapacityNote over={newPlaces.over} checked={overOk} onChange={setOverOk} /></div> : null}
          </Panel>
        </>
      ) : (
        <>
          <Panel
            icon="groups"
            title={t('classEditor.teamTitle')}
            description={t('classEditor.teamDescription')}
            actions={
              <Button asChild variant="ghost" size="sm" className="gap-1 text-primary">
                <Link to={`${base}/classes/teams${classId ? `?edit=${classId}` : ''}`}>
                  {t('classEditor.allTeams')}
                  <MaterialSymbol name="chevron_right" size="text-base" className="rtl:rotate-180" />
                </Link>
              </Button>
            }
            testId="class-editor-team"
          >
            {teamClass ? (
              <ClassTeamCard
                cls={teamClass}
                staff={team.staff}
                nameOf={team.nameOf}
                canUpdate={team.canUpdate}
                busy={team.busy}
                problem={team.problemFor(teamClass.id)}
                onPlace={(role, userId) => void team.place(teamClass, role, userId)}
                onRemove={(userId) => void team.takeOut(teamClass, userId)}
              />
            ) : team.query.isPending ? <LoadingSkeleton /> : <p className="text-sm text-on-surface-variant">{t('classEditor.teamUnavailable')}</p>}
          </Panel>

          {editor ? <ClassRosterTable editor={editor} className={className} base={base} canUpdate={editor.can.update} /> : null}
        </>
      )}

      {canSave && (isNew || dirty) ? (
        <div className="sticky bottom-4 z-20 me-20 rounded-xl border border-outline-variant bg-surface/95 p-3 shadow-lg backdrop-blur sm:px-4" data-testid="class-save-bar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={cn('flex items-center gap-2 text-sm', Object.keys(issues).length && tried ? 'text-error' : 'text-on-surface-variant')}>
              <MaterialSymbol name={Object.keys(issues).length && tried ? 'error' : 'edit_note'} size="text-lg" />
              {Object.keys(issues).length && tried ? t('classEditor.fixProblems') : isNew ? t('classEditor.create.ready') : t('classEditor.unsaved')}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => (isNew ? navigate(back) : (setDraft(saved), setTried(false), setTouched({})))}>
                {isNew ? t('common.cancel') : t('classEditor.discard')}
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={busy || (!isNew && !dirty)} aria-busy={busy} data-testid="class-save">
                {busy ? t('common.saving') : isNew ? t('admin.classes.actions.create') : t('common.saveChanges')}
              </Button>
            </div>
          </div>
          <div className="empty:hidden [&>*]:mt-3">
            <FormProblem message={problem} />
          </div>
        </div>
      ) : null}

      {deleting && editor?.cls ? (
        <DeleteClassDialog
          classId={editor.cls.id}
          className={className}
          childrenCount={editor.children.length}
          classes={editor.classes}
          onDeleted={() => navigate(`${base}/classes`, { replace: true })}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </div>
  );
}
