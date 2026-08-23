import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Select } from '@/components/ui/select';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import {
  useAddClassAssistant,
  useAssignChildToClass,
  useClassRoster,
  useClassWithStaff,
  useCreateClass,
  useDeleteClass,
  useNurseryClasses,
  useNurseryTeachers,
  useRemoveClassStaff,
  useSetClassLead,
  useUnassignedChildren,
  useUpdateClassDetails,
  type StaffPerson,
} from '@/hooks/useClassStaff';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';

function localized(
  ar: string | null | undefined,
  en: string | null | undefined,
  pref: 'ar' | 'en' | 'both',
): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || '—';
  if (pref === 'en') return e || a || '—';
  if (a && e) return `${a} / ${e}`;
  return a || e || '—';
}

function personLabel(p: StaffPerson | null | undefined, pref: 'ar' | 'en' | 'both'): string {
  if (!p) return '—';
  return localized(p.name_ar, p.name_en, pref);
}

export function AdminClassDetailPage() {
  const { classId: rawClassId } = useParams();
  const isNew = !rawClassId || rawClassId === 'new';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeNurseryId } = useActiveNurseryId();

  const classQuery = useClassWithStaff(isNew ? null : rawClassId ?? null);
  // For existing classes, lock nursery-scoped pickers (teachers, unassigned
  // children, sibling classes) to the class's own nursery so an admin who
  // switches the sidebar picker mid-edit doesn't mix data across nurseries.
  // For the new-class flow, the active picker selection is the target nursery.
  const nurseryId = isNew ? activeNurseryId : classQuery.data?.nursery_id ?? null;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);

  const teachersQuery = useNurseryTeachers(nurseryId);
  const rosterQuery = useClassRoster(isNew ? null : rawClassId ?? null);
  const unassignedQuery = useUnassignedChildren(nurseryId);
  const otherClassesQuery = useNurseryClasses(nurseryId);

  const updateMut = useUpdateClassDetails();
  const createMut = useCreateClass();
  const deleteMut = useDeleteClass();
  const setLeadMut = useSetClassLead();
  const addAssistMut = useAddClassAssistant();
  const removeStaffMut = useRemoveClassStaff();
  const assignChildMut = useAssignChildToClass();

  // Form state for Details tab.
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [leadId, setLeadId] = useState('');

  useEffect(() => {
    const c = classQuery.data;
    if (!c) return;
    setNameAr(c.name_ar ?? '');
    setNameEn(c.name_en ?? '');
    setGradeLevel(c.grade_level ?? '');
    setRoomNumber(c.room_number ?? '');
    setCapacity(c.capacity != null ? String(c.capacity) : '');
    setLeadId(c.lead?.id ?? '');
  }, [classQuery.data]);

  // Pickers.
  const [assistantPick, setAssistantPick] = useState('');
  const [childPick, setChildPick] = useState('');
  const [movePicks, setMovePicks] = useState<Record<string, string>>({});
  // New-class flow: pre-select children to assign on creation.
  const [initialChildIds, setInitialChildIds] = useState<Set<string>>(new Set());
  const [initialChildSearch, setInitialChildSearch] = useState('');

  const teacherOptions = teachersQuery.data ?? [];
  const assignedAssistantIds = new Set((classQuery.data?.assistants ?? []).map((a) => a.id));
  const assistantCandidates = teacherOptions.filter(
    (u) => !assignedAssistantIds.has(u.id) && u.id !== leadId,
  );

  const onSaveDetails = async () => {
    if (!nameAr.trim() && !nameEn.trim()) {
      toast.error(t('admin.classes.validation.nameRequired'));
      return;
    }
    const payload = {
      name_ar: nameAr.trim() || nameEn.trim(),
      name_en: nameEn.trim() || nameAr.trim(),
      grade_level: gradeLevel.trim() || null,
      room_number: roomNumber.trim() || null,
      capacity: capacity.trim() ? Number(capacity) : null,
    };
    try {
      if (isNew) {
        if (!nurseryId) {
          toast.error(t('admin.classes.validation.noActiveNursery'));
          return;
        }
        const newId = await createMut.mutateAsync({ nursery_id: nurseryId, ...payload });
        if (leadId) {
          try {
            await setLeadMut.mutateAsync({ classId: newId, userId: leadId });
          } catch {
            /* surfaced separately */
          }
        }
        const childrenToAssign = Array.from(initialChildIds);
        let assignedCount = 0;
        if (childrenToAssign.length > 0) {
          const results = await Promise.allSettled(
            childrenToAssign.map((childId) =>
              assignChildMut.mutateAsync({ childId, classId: newId }),
            ),
          );
          assignedCount = results.filter((r) => r.status === 'fulfilled').length;
          const failed = results.length - assignedCount;
          if (failed > 0) {
            toast.error(t('admin.classes.toasts.someChildrenAssignFailed', { count: failed }));
          }
        }
        toast.success(
          assignedCount > 0
            ? t('admin.classes.toasts.createdWithChildren', { count: assignedCount })
            : t('admin.classes.toasts.createdOk'),
        );
        navigate(`/admin/classes/${newId}`, { replace: true });
      } else if (rawClassId) {
        await updateMut.mutateAsync({ classId: rawClassId, ...payload });
        // Lead change.
        const currentLead = classQuery.data?.lead?.id ?? '';
        if (leadId !== currentLead) {
          await setLeadMut.mutateAsync({ classId: rawClassId, userId: leadId || null });
        }
        toast.success(t('admin.classes.toasts.updatedOk'));
        navigate('/admin/classes');
      }
    } catch (err) {
      console.error(err);
      const e = err as { message?: string; details?: string; hint?: string } | null;
      const detail =
        err instanceof Error
          ? err.message
          : e?.message || e?.details || e?.hint || JSON.stringify(err);
      toast.error(`${t('admin.classes.toasts.saveFailed')}: ${detail}`);
    }
  };

  const onDelete = async () => {
    if (!rawClassId) return;
    if (!(await confirm({ description: t('admin.classes.actions.deleteConfirm'), variant: 'danger' })))
      return;
    try {
      await deleteMut.mutateAsync(rawClassId);
      toast.success(t('admin.classes.toasts.deletedOk'));
      navigate('/admin/classes');
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.deleteFailed'));
    }
  };

  const onAddAssistant = async () => {
    if (!rawClassId || !assistantPick) return;
    try {
      await addAssistMut.mutateAsync({ classId: rawClassId, userId: assistantPick });
      setAssistantPick('');
      toast.success(t('admin.classes.toasts.assistantAdded'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.saveFailed'));
    }
  };

  const onRemoveAssistant = async (userId: string) => {
    if (!rawClassId) return;
    try {
      await removeStaffMut.mutateAsync({ classId: rawClassId, userId });
      toast.success(t('admin.classes.toasts.assistantRemoved'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.saveFailed'));
    }
  };

  const onAddChild = async () => {
    if (!rawClassId || !childPick) return;
    try {
      await assignChildMut.mutateAsync({ childId: childPick, classId: rawClassId });
      setChildPick('');
      toast.success(t('admin.classes.toasts.childAdded'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.saveFailed'));
    }
  };

  const onRemoveChild = async (childId: string) => {
    try {
      await assignChildMut.mutateAsync({ childId, classId: null, sourceClassId: rawClassId });
      toast.success(t('admin.classes.toasts.childRemoved'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.saveFailed'));
    }
  };

  const onMoveChild = async (childId: string) => {
    const targetClass = movePicks[childId];
    if (!targetClass) return;
    try {
      await assignChildMut.mutateAsync({ childId, classId: targetClass, sourceClassId: rawClassId });
      setMovePicks((prev) => {
        const next = { ...prev };
        delete next[childId];
        return next;
      });
      toast.success(t('admin.classes.toasts.childMoved'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.saveFailed'));
    }
  };

  const otherClasses = useMemo(
    () => (otherClassesQuery.data ?? []).filter((c) => c.id !== rawClassId),
    [otherClassesQuery.data, rawClassId],
  );

  // Save is enabled only once the form differs from the loaded class (or, for a
  // new class, once anything has been entered).
  const isDirty = useMemo(() => {
    if (isNew) {
      return (
        nameAr.trim() !== '' ||
        nameEn.trim() !== '' ||
        gradeLevel.trim() !== '' ||
        roomNumber.trim() !== '' ||
        capacity.trim() !== '' ||
        leadId !== '' ||
        initialChildIds.size > 0
      );
    }
    const c = classQuery.data;
    if (!c) return false;
    return (
      nameAr !== (c.name_ar ?? '') ||
      nameEn !== (c.name_en ?? '') ||
      gradeLevel !== (c.grade_level ?? '') ||
      roomNumber !== (c.room_number ?? '') ||
      capacity !== (c.capacity != null ? String(c.capacity) : '') ||
      leadId !== (c.lead?.id ?? '')
    );
  }, [
    isNew,
    nameAr,
    nameEn,
    gradeLevel,
    roomNumber,
    capacity,
    leadId,
    initialChildIds,
    classQuery.data,
  ]);

  const initialChildCandidates = useMemo(() => {
    const list = unassignedQuery.data ?? [];
    const q = initialChildSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const ar = (c.full_name_ar ?? '').toLowerCase();
      const en = (c.full_name_en ?? '').toLowerCase();
      return ar.includes(q) || en.includes(q);
    });
  }, [unassignedQuery.data, initialChildSearch]);

  const toggleInitialChild = (id: string) => {
    setInitialChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisibleChildren = () => {
    setInitialChildIds((prev) => {
      const next = new Set(prev);
      for (const c of initialChildCandidates) next.add(c.id);
      return next;
    });
  };

  const clearAllInitialChildren = () => setInitialChildIds(new Set());

  if (!isNew && classQuery.isLoading) return <LoadingSkeleton />;
  if (!isNew && !classQuery.data) {
    return (
      <EmptyState
        icon="school"
        title={t('admin.classes.detail.notFoundTitle')}
        description={t('admin.classes.detail.notFoundDescription')}
      />
    );
  }

  const classData = classQuery.data;
  const overCapacity =
    classData?.capacity != null && classData.capacity > 0 && classData.child_count > classData.capacity;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {isNew
              ? t('admin.classes.detail.newTitle')
              : localized(classData?.name_ar, classData?.name_en, languagePref)}
          </h1>
          <p className="text-sm text-foreground-secondary">
            {isNew ? t('admin.classes.detail.newSubtitle') : t('admin.classes.detail.subtitle')}
          </p>
        </div>
        {!isNew ? (
          <Button variant="outline" onClick={onDelete} disabled={deleteMut.isPending}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>delete</span>
            {t('common.delete')}
          </Button>
        ) : null}
      </div>

        {/* DETAILS */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.classes.tabs.details')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.nameAr')}</Label>
                <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.nameEn')}</Label>
                <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.gradeLevel')}</Label>
                <Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.roomNumber')}</Label>
                <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.capacity')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.classes.fields.leadTeacher')}</Label>
                <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">{t('admin.classes.fields.noLead')}</option>
                  {teacherOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {personLabel(u, languagePref)}
                    </option>
                  ))}
                </Select>
              </div>
              {isNew ? (
                <div className="md:col-span-2 space-y-3 rounded-md border border-border-subtle bg-surface-low p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t('admin.classes.detail.assignChildrenTitle')}
                      </p>
                      <p className="text-xs text-foreground-secondary">
                        {t('admin.classes.detail.assignChildrenHelp')}
                      </p>
                    </div>
                    <p className="text-xs text-foreground-secondary">
                      {t('admin.classes.detail.assignChildrenSelected', { count: initialChildIds.size })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={initialChildSearch}
                      onChange={(e) => setInitialChildSearch(e.target.value)}
                      placeholder={t('admin.classes.detail.assignChildrenSearch')}
                      className="max-w-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={selectAllVisibleChildren}
                      disabled={initialChildCandidates.length === 0}
                    >
                      {t('admin.classes.detail.assignChildrenSelectAll')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearAllInitialChildren}
                      disabled={initialChildIds.size === 0}
                    >
                      {t('admin.classes.detail.assignChildrenClear')}
                    </Button>
                  </div>
                  {unassignedQuery.isLoading ? (
                    <LoadingSkeleton />
                  ) : (unassignedQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-foreground-secondary">
                      {t('admin.classes.detail.noUnassignedChildren')}
                    </p>
                  ) : initialChildCandidates.length === 0 ? (
                    <p className="text-sm text-foreground-secondary">
                      {t('admin.classes.detail.assignChildrenSearchEmpty')}
                    </p>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-container-lowest">
                      {initialChildCandidates.map((c) => {
                        const checked = initialChildIds.has(c.id);
                        const inputId = `initial-child-${c.id}`;
                        return (
                          <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              onCheckedChange={() => toggleInitialChild(c.id)}
                            />
                            <Label htmlFor={inputId} className="cursor-pointer text-sm font-normal">
                              {localized(c.full_name_ar, c.full_name_en, languagePref)}
                            </Label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {!isNew ? (
          <>
            {/* STAFF */}
            <section className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.classes.staff.leadTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border-subtle bg-surface-low p-3">
                  <p className="text-xs text-foreground-secondary">{t('admin.classes.staff.currentLead')}</p>
                  <p className="text-sm font-medium text-foreground">
                    {personLabel(classData?.lead, languagePref)}
                  </p>
                </div>
                <p className="text-xs text-foreground-secondary">
                  {t('admin.classes.staff.leadHelp')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('admin.classes.staff.assistantsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[220px] space-y-1">
                    <Label>{t('admin.classes.staff.addAssistant')}</Label>
                    <Select value={assistantPick} onChange={(e) => setAssistantPick(e.target.value)}>
                      <option value="">{t('common.select')}</option>
                      {assistantCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {personLabel(u, languagePref)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={onAddAssistant} disabled={!assistantPick || addAssistMut.isPending}>
                    {t('admin.classes.actions.add')}
                  </Button>
                </div>

                {(classData?.assistants ?? []).length === 0 ? (
                  <p className="text-sm text-foreground-secondary">
                    {t('admin.classes.staff.noAssistants')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(classData?.assistants ?? []).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-low p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{personLabel(a, languagePref)}</p>
                          <p className="text-xs text-foreground-secondary">{a.email ?? a.phone ?? ''}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => onRemoveAssistant(a.id)}>
                          {t('common.delete')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            </section>

            {/* ROSTER */}
            <section>
              <Card>
            <CardHeader>
              <CardTitle>{t('admin.classes.roster.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className={overCapacity ? 'text-sm font-semibold text-error' : 'text-sm text-foreground-secondary'}>
                  {t('admin.classes.roster.count', {
                    count: classData?.child_count ?? 0,
                    capacity: classData?.capacity ?? '—',
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[220px] space-y-1">
                  <Label>{t('admin.classes.roster.addChild')}</Label>
                  <Select value={childPick} onChange={(e) => setChildPick(e.target.value)}>
                    <option value="">{t('common.select')}</option>
                    {(unassignedQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {localized(c.full_name_ar, c.full_name_en, languagePref)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={onAddChild} disabled={!childPick || assignChildMut.isPending}>
                  {t('admin.classes.actions.add')}
                </Button>
              </div>

              {rosterQuery.isLoading ? (
                <LoadingSkeleton />
              ) : (rosterQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-foreground-secondary">{t('admin.classes.roster.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {(rosterQuery.data ?? []).map((child) => (
                    <li
                      key={child.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-low p-3"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {localized(child.full_name_ar, child.full_name_en, languagePref)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={movePicks[child.id] ?? ''}
                          onChange={(e) => setMovePicks((prev) => ({ ...prev, [child.id]: e.target.value }))}
                          className="h-9 max-w-[200px]"
                        >
                          <option value="">{t('admin.classes.roster.moveTo')}</option>
                          {otherClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {localized(c.name_ar, c.name_en, languagePref)}
                            </option>
                          ))}
                        </Select>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onMoveChild(child.id)}
                          disabled={!movePicks[child.id]}
                        >
                          {t('admin.classes.actions.move')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onRemoveChild(child.id)}>
                          {t('admin.classes.actions.removeFromClass')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
              </Card>
            </section>
          </>
        ) : null}

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-end gap-2 border-t border-border-subtle bg-surface px-4 py-3">
        <Button variant="secondary" onClick={() => navigate('/admin/classes')}>
          {t('common.cancel')}
        </Button>
        <Button
          onClick={onSaveDetails}
          disabled={
            !isDirty ||
            updateMut.isPending ||
            createMut.isPending ||
            setLeadMut.isPending ||
            assignChildMut.isPending
          }
        >
          {isNew ? t('admin.classes.actions.create') : t('common.saveChanges')}
        </Button>
      </div>
    </div>
  );
}
