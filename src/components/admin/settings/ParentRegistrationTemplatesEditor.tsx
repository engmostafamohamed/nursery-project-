import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_PARENT_REGISTRATION_QUESTIONS,
  REGISTRATION_QUESTION_TYPES,
  SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS,
  SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS,
  deriveStepOrder,
  moveQuestionInStep,
  moveStepOrder,
  type RegistrationQuestionType,
  type RegistrationTemplateQuestion,
  type RegistrationTemplateStep,
} from '@/features/parent-signup/registrationTemplates';
import { cn } from '@/lib/utils';

type TemplateRow = {
  id: string;
  nursery_id: string;
  name: string;
  version: number;
  status: 'draft' | 'review' | 'active' | 'archived';
  is_active: boolean;
  questions_json: RegistrationTemplateQuestion[];
  created_from_template_id: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateWithUsage = TemplateRow & { usedCount: number };

/** The fields an admin edits locally before choosing Save or Submit for review — nothing
 * here reaches the database until then. */
type Draft = {
  id: string;
  name: string;
  status: TemplateRow['status'];
  questions_json: RegistrationTemplateQuestion[];
};

const queryKey = (nurseryId: string | undefined) => ['parent-registration-templates', nurseryId];

const STEP_LABELS: Record<RegistrationTemplateStep, string> = {
  child: 'Child',
  parents: 'Parents',
  family: 'Family',
  enrollment: 'Enrollment',
  health: 'Health',
  emergency: 'Emergency',
  dailyCare: 'Daily Care',
  pickups: 'Pickups',
  medicationConsents: 'Medication',
  documents: 'Documents',
  consents: 'Consents',
};

const STEP_ICONS: Record<RegistrationTemplateStep, string> = {
  child: 'child_care',
  parents: 'family_restroom',
  family: 'diversity_3',
  enrollment: 'school',
  health: 'health_and_safety',
  emergency: 'emergency',
  dailyCare: 'wb_sunny',
  pickups: 'directions_walk',
  medicationConsents: 'medication',
  documents: 'description',
  consents: 'fact_check',
};

const QUESTION_TYPE_ICON: Record<RegistrationQuestionType, string> = {
  short_text: 'short_text',
  long_text: 'notes',
  number: 'tag',
  date: 'calendar_month',
  yes_no: 'toggle_on',
  single_choice: 'radio_button_checked',
  multi_choice: 'checklist',
  file: 'attach_file',
};

const STATUS_LABELS: Record<TemplateRow['status'], string> = {
  draft: 'Draft',
  review: 'In Review',
  active: 'Active',
  archived: 'Not Active',
};

const STATUS_BADGE_VARIANT: Record<TemplateRow['status'], 'secondary' | 'success' | 'warning' | 'outline'> = {
  draft: 'secondary',
  review: 'warning',
  active: 'success',
  archived: 'outline',
};

const DISCARD_CHANGES_PROMPT = {
  title: 'Discard unsaved changes?',
  description: "Switching templates will discard changes you haven't saved yet.",
  variant: 'danger' as const,
  confirmText: 'Discard',
};

function blankQuestion(step: RegistrationTemplateQuestion['step']): RegistrationTemplateQuestion {
  return {
    id: crypto.randomUUID(),
    step,
    label: 'New question',
    type: 'short_text',
    required: false,
    active: true,
    validation: {},
    options: [],
  };
}

function normalizeQuestions(value: unknown): RegistrationTemplateQuestion[] {
  return Array.isArray(value)
    ? value.filter((question): question is RegistrationTemplateQuestion => Boolean(question) && typeof question === 'object')
    : [];
}

function isSystemRequiredQuestion(question: RegistrationTemplateQuestion) {
  return SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS.includes(question.fieldKey as (typeof SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS)[number]);
}

function isSystemAlwaysActiveQuestion(question: RegistrationTemplateQuestion) {
  return SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS.includes(question.fieldKey as (typeof SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS)[number]);
}

/** A step with nothing active in it won't actually appear on the live signup form —
 * surfacing that here keeps the editor honest about what parents will see. */
function stepHasActiveQuestions(step: RegistrationTemplateStep, questions: RegistrationTemplateQuestion[]) {
  return questions.some((question) => question.step === step && question.active);
}

function QuestionCard({
  question,
  locked,
  expanded,
  canMoveUp,
  canMoveDown,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: RegistrationTemplateQuestion;
  locked: boolean;
  expanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<RegistrationTemplateQuestion>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const systemRequired = isSystemRequiredQuestion(question);
  const systemAlwaysActive = isSystemAlwaysActiveQuestion(question);
  const isChoiceType = question.type === 'single_choice' || question.type === 'multi_choice';
  const isActive = systemAlwaysActive || question.active;
  const isRequired = systemRequired || question.required;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        expanded ? 'border-primary/30 bg-surface shadow-sm' : 'border-outline-variant bg-surface-container-lowest',
      )}
    >
      <div className="flex items-center gap-2 p-2 sm:p-3">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            disabled={locked || !canMoveUp}
            onClick={onMoveUp}
            title="Move question up"
            aria-label="Move question up"
            className="flex h-4 w-6 items-center justify-center rounded text-on-surface-variant hover:bg-surface-high disabled:pointer-events-none disabled:opacity-25"
          >
            <MaterialSymbol name="keyboard_arrow_up" size="text-base" />
          </button>
          <button
            type="button"
            disabled={locked || !canMoveDown}
            onClick={onMoveDown}
            title="Move question down"
            aria-label="Move question down"
            className="flex h-4 w-6 items-center justify-center rounded text-on-surface-variant hover:bg-surface-high disabled:pointer-events-none disabled:opacity-25"
          >
            <MaterialSymbol name="keyboard_arrow_down" size="text-base" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              isActive ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant',
            )}
          >
            <MaterialSymbol name={QUESTION_TYPE_ICON[question.type]} size="text-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-on-surface">{question.label || 'Untitled question'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="capitalize">{question.type.replace('_', ' ')}</Badge>
              {isRequired ? <Badge variant="warning">Required</Badge> : null}
              {!isActive ? <Badge variant="secondary">Inactive</Badge> : null}
              {systemAlwaysActive ? <Badge>{systemRequired ? 'System field' : 'Account field'}</Badge> : null}
            </div>
          </div>
          <MaterialSymbol
            name={expanded ? 'expand_less' : 'expand_more'}
            className="shrink-0 text-on-surface-variant"
          />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-outline-variant p-3 sm:p-4">
          <div className="text-xs text-on-surface-variant">
            {question.fieldKey ? `Field key: ${String(question.fieldKey)}` : 'Custom question — not tied to a built-in field'}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[200px] flex-[2] space-y-1.5">
              <Label>Question</Label>
              <Input value={question.label} disabled={locked} onChange={(e) => onChange({ label: e.target.value })} />
            </div>
            <div className="min-w-[160px] flex-1 space-y-1.5">
              <Label>Answer type</Label>
              <Select
                value={question.type}
                disabled={locked}
                onChange={(e) => onChange({ type: e.target.value as RegistrationQuestionType })}
              >
                {REGISTRATION_QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace('_', ' ')}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <Checkbox
                checked={isRequired}
                disabled={locked || systemRequired}
                onCheckedChange={(checked) => onChange({ required: checked === true })}
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface">
              <Checkbox
                checked={isActive}
                disabled={locked || systemAlwaysActive}
                onCheckedChange={(checked) => onChange({ active: checked === true })}
              />
              Active (shown to parents)
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Help text</Label>
            <Input
              value={question.helpText ?? ''}
              disabled={locked}
              placeholder="Optional hint shown under the question"
              onChange={(e) => onChange({ helpText: e.target.value })}
            />
          </div>

          {isChoiceType ? (
            <div className="space-y-1.5">
              <Label>Answer options</Label>
              <Textarea
                value={(question.options ?? []).join('\n')}
                disabled={locked}
                className="min-h-20"
                placeholder={'One option per line'}
                onChange={(e) =>
                  onChange({ options: e.target.value.split('\n').map((option) => option.trim()).filter(Boolean) })
                }
              />
              <p className="text-xs text-on-surface-variant">One option per line.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Validation</Label>
            <div className="flex flex-wrap gap-3">
              <Input
                type="number"
                disabled={locked}
                placeholder="Min length"
                className="w-28"
                value={question.validation?.minLength ?? ''}
                onChange={(e) => onChange({ validation: { ...question.validation, minLength: e.target.value ? Number(e.target.value) : null } })}
              />
              <Input
                type="number"
                disabled={locked}
                placeholder="Max length"
                className="w-28"
                value={question.validation?.maxLength ?? ''}
                onChange={(e) => onChange({ validation: { ...question.validation, maxLength: e.target.value ? Number(e.target.value) : null } })}
              />
              <Input
                type="number"
                disabled={locked}
                placeholder="Min"
                className="w-24"
                value={question.validation?.min ?? ''}
                onChange={(e) => onChange({ validation: { ...question.validation, min: e.target.value ? Number(e.target.value) : null } })}
              />
              <Input
                type="number"
                disabled={locked}
                placeholder="Max"
                className="w-24"
                value={question.validation?.max ?? ''}
                onChange={(e) => onChange({ validation: { ...question.validation, max: e.target.value ? Number(e.target.value) : null } })}
              />
              <Input
                disabled={locked}
                placeholder="Regex pattern"
                className="min-w-[160px] flex-1"
                value={question.validation?.pattern ?? ''}
                onChange={(e) => onChange({ validation: { ...question.validation, pattern: e.target.value || null } })}
              />
            </div>
          </div>

          <div className="flex justify-end border-t border-outline-variant pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-error hover:bg-error/10"
              disabled={locked || systemAlwaysActive}
              title={systemAlwaysActive ? "System fields can't be removed" : undefined}
              onClick={onRemove}
            >
              <MaterialSymbol name="delete" size="text-base" />
              Remove question
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ParentRegistrationTemplatesEditor({ nurseryId }: { nurseryId?: string | null }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const templatesQuery = useQuery({
    queryKey: queryKey(nurseryId ?? undefined),
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<TemplateWithUsage[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('parent_registration_templates')
        .select('*')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as Omit<TemplateRow, 'questions_json'>),
        questions_json: normalizeQuestions(row.questions_json),
      })) as TemplateRow[];

      const ids = rows.map((row) => row.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const appsRes = await supabase
          .from('applications')
          .select('registration_template_id')
          .in('registration_template_id', ids);
        if (appsRes.error) throw appsRes.error;
        ((appsRes.data ?? []) as Array<{ registration_template_id: string | null }>).forEach((app) => {
          if (app.registration_template_id) counts.set(app.registration_template_id, (counts.get(app.registration_template_id) ?? 0) + 1);
        });
      }

      return rows.map((row) => ({ ...row, usedCount: counts.get(row.id) ?? 0 }));
    },
  });

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? templates[0] ?? null,
    [selectedId, templates],
  );
  const locked = Boolean(selected && selected.usedCount > 0);

  // The draft mirrors whichever template is selected, but only reseeds when the selected
  // template's *id* changes — a background refetch of the same template (after Save, for
  // instance) never clobbers edits the admin hasn't saved yet.
  useEffect(() => {
    setDraft(
      selected
        ? { id: selected.id, name: selected.name, status: selected.status, questions_json: selected.questions_json }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const isDirty = Boolean(
    draft &&
      selected &&
      (draft.name !== selected.name ||
        draft.status !== selected.status ||
        JSON.stringify(draft.questions_json) !== JSON.stringify(selected.questions_json)),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey(nurseryId ?? undefined) });

  const confirmDiscardIfDirty = async () => {
    if (!isDirty) return true;
    return confirm(DISCARD_CHANGES_PROMPT);
  };

  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!nurseryId) throw new Error('Missing nursery id');
      const { data, error } = await supabase
        .from('parent_registration_templates')
        .insert({
          nursery_id: nurseryId,
          name: 'Parent Registration',
          version: 1,
          status: 'draft',
          is_active: false,
          questions_json: DEFAULT_PARENT_REGISTRATION_QUESTIONS,
        } as never)
        .select('id')
        .single();
      if (error) throw error;
      return String((data as { id: string }).id);
    },
    onSuccess: (id) => {
      setSelectedId(id);
      void invalidate();
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (updates: Partial<TemplateRow> & { id: string }) => {
      const { id, ...patch } = updates;
      const { error } = await supabase
        .from('parent_registration_templates')
        .update(patch as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  const duplicateTemplate = useMutation({
    mutationFn: async (source: TemplateWithUsage) => {
      if (!nurseryId) throw new Error('Missing nursery id');
      const nextVersion = Math.max(1, ...templates.map((template) => template.version)) + 1;
      const { data, error } = await supabase
        .from('parent_registration_templates')
        .insert({
          nursery_id: nurseryId,
          name: `${source.name} v${nextVersion}`,
          version: nextVersion,
          status: 'draft',
          is_active: false,
          questions_json: source.questions_json,
          created_from_template_id: source.id,
        } as never)
        .select('id')
        .single();
      if (error) throw error;
      return String((data as { id: string }).id);
    },
    onSuccess: (id) => {
      setSelectedId(id);
      void invalidate();
      toast.success('Template duplicated. Edit the new draft.');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parent_registration_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId('');
      void invalidate();
    },
  });

  const persistDraft = useMutation({
    mutationFn: async (statusOverride: TemplateRow['status'] | undefined) => {
      if (!draft) throw new Error('Nothing to save');
      const payload = { name: draft.name, status: statusOverride ?? draft.status, questions_json: draft.questions_json };
      const { error } = await supabase.from('parent_registration_templates').update(payload as never).eq('id', draft.id);
      if (error) throw error;
      return payload.status;
    },
    onSuccess: (status) => {
      setDraft((prev) => (prev ? { ...prev, status } : prev));
      void invalidate();
    },
  });

  const handleSave = async () => {
    try {
      await persistDraft.mutateAsync(undefined);
      toast.success('Template saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save template.');
    }
  };

  const handleSubmitForReview = async () => {
    try {
      await persistDraft.mutateAsync('review');
      toast.success('Submitted for review.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit template.');
    }
  };

  const discardChanges = () => {
    if (!selected) return;
    setDraft({ id: selected.id, name: selected.name, status: selected.status, questions_json: selected.questions_json });
  };

  const selectTemplate = async (id: string) => {
    if (id === selectedId || (!selectedId && id === selected?.id)) return;
    if (!(await confirmDiscardIfDirty())) return;
    setSelectedId(id);
  };

  const handleCreateTemplate = async () => {
    if (!(await confirmDiscardIfDirty())) return;
    void createTemplate.mutateAsync();
  };

  const handleDuplicate = async () => {
    if (!selected) return;
    if (!(await confirmDiscardIfDirty())) return;
    void duplicateTemplate.mutateAsync(selected);
  };

  const activateSelected = async () => {
    if (!selected) return;
    const previouslyActive = templates.find((template) => template.is_active && template.id !== selected.id) ?? null;

    const ok = await confirm({
      title: 'Activate this template?',
      description: previouslyActive
        ? `"${selected.name}" will become the live registration form parents see. "${previouslyActive.name}" will switch to Not Active.`
        : `"${selected.name}" will become the live registration form parents see.`,
      confirmText: 'Activate',
    });
    if (!ok) return;

    try {
      if (selected.status !== 'active') {
        await updateTemplate.mutateAsync({ id: selected.id, status: 'active' });
      }
      // Only one template may be active per nursery. Clear the flag from every other
      // template, and roll whichever one was previously live back to Not Active so its
      // status badge doesn't keep reading "Active" once another template has replaced it.
      await supabase
        .from('parent_registration_templates')
        .update({ is_active: false } as never)
        .eq('nursery_id', selected.nursery_id)
        .neq('id', selected.id);
      if (previouslyActive) {
        await supabase
          .from('parent_registration_templates')
          .update({ status: 'archived' } as never)
          .eq('id', previouslyActive.id);
      }
      await supabase
        .from('parent_registration_templates')
        .update({ is_active: true, status: 'active' } as never)
        .eq('id', selected.id);
      setDraft((prev) => (prev && prev.id === selected.id ? { ...prev, status: 'active' } : prev));
      await invalidate();
      toast.success('Template activated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not activate template.');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = await confirm({
      title: 'Delete this template?',
      description: `"${selected.name}" will be permanently removed. This can't be undone.`,
      variant: 'danger',
    });
    if (!ok) return;
    void deleteTemplate.mutateAsync(selected.id);
  };

  const updateQuestion = (questionId: string, patch: Partial<RegistrationTemplateQuestion>) => {
    if (!draft || locked) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions_json: prev.questions_json.map((question) =>
              question.id === questionId
                ? {
                    ...question,
                    ...patch,
                    ...(isSystemAlwaysActiveQuestion(question) ? { active: true } : {}),
                    ...(isSystemRequiredQuestion(question) ? { required: true } : {}),
                  }
                : question,
            ),
          }
        : prev,
    );
  };

  const addQuestion = (step: RegistrationTemplateQuestion['step']) => {
    if (!draft || locked) return;
    const question = blankQuestion(step);
    setDraft((prev) => (prev ? { ...prev, questions_json: [...prev.questions_json, question] } : prev));
    setExpandedIds((prev) => new Set(prev).add(question.id));
  };

  const removeQuestion = (questionId: string) => {
    if (!draft || locked) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            questions_json: prev.questions_json.filter(
              (question) => question.id !== questionId || isSystemAlwaysActiveQuestion(question),
            ),
          }
        : prev,
    );
  };

  const moveQuestion = (questionId: string, direction: 'up' | 'down') => {
    if (!draft || locked) return;
    setDraft((prev) => (prev ? { ...prev, questions_json: moveQuestionInStep(prev.questions_json, questionId, direction) } : prev));
  };

  const moveStep = (step: RegistrationTemplateStep, direction: 'up' | 'down') => {
    if (!draft || locked) return;
    setDraft((prev) => (prev ? { ...prev, questions_json: moveStepOrder(prev.questions_json, step, direction) } : prev));
  };

  if (!nurseryId) return null;

  const stepOrder = draft ? deriveStepOrder(draft.questions_json) : [];
  const lifecycleActionsDisabledTitle = isDirty ? 'Save your changes first.' : undefined;

  return (
    <section className="space-y-4">
      {templatesQuery.isError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-error">
          <MaterialSymbol name="error" size="text-xl" className="mt-0.5 shrink-0" />
          <p>Apply the parent registration templates migration, then refresh this page.</p>
        </div>
      ) : templatesQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full max-w-sm rounded-lg" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : !templates.length ? (
        <EmptyState
          icon="assignment_add"
          title="No templates yet"
          description="Create one to start from the current Parent Registration questions — you can fully customize it before activating."
          action={
            <Button type="button" onClick={() => void handleCreateTemplate()} disabled={createTemplate.isPending}>
              <MaterialSymbol name="add" size="text-base" />
              Create starter template
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label>Template</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={createTemplate.isPending}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{selected?.name ?? 'Select a template'}</span>
                    {selected ? (
                      <Badge variant={STATUS_BADGE_VARIANT[selected.status]} className="shrink-0">
                        v{selected.version} · {STATUS_LABELS[selected.status]}
                      </Badge>
                    ) : null}
                  </span>
                  <MaterialSymbol name="expand_more" size="text-base" className="shrink-0 text-on-surface-variant" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-[300px]">
                {templates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => void selectTemplate(template.id)}
                    className={cn('flex-col items-start gap-1 py-2', selected?.id === template.id && 'bg-primary/5')}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <MaterialSymbol
                        name="check"
                        size="text-base"
                        className={cn('shrink-0 text-primary', selected?.id !== template.id && 'invisible')}
                      />
                      <span className="truncate font-medium text-on-surface">{template.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 ps-6">
                      <Badge variant={STATUS_BADGE_VARIANT[template.status]}>
                        v{template.version} · {STATUS_LABELS[template.status]}
                      </Badge>
                      {template.is_active ? <Badge variant="success">Active</Badge> : null}
                      {template.usedCount > 0 ? (
                        <Badge variant="outline">
                          <MaterialSymbol name="lock" size="text-xs" className="me-1" />
                          {template.usedCount} registration{template.usedCount === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleCreateTemplate()}>
                  <MaterialSymbol name="add" size="text-base" className="me-1.5" />
                  Create new template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {selected && draft ? (
            <>
              <div className="min-w-0 rounded-2xl border border-outline-variant bg-surface p-4">
                {/* flex-wrap, not a fixed-column grid: this panel sits inside the settings
                    page's own sidebar layout, so it gets far less width than the browser
                    viewport suggests — a viewport-breakpoint grid here overlaps at the
                    widths this container actually renders at. */}
                <div className="space-y-1.5">
                  <Label>Template name</Label>
                  <Input
                    value={draft.name}
                    disabled={locked}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="w-24 space-y-1.5">
                    <Label>Version</Label>
                    <div className="flex h-12 items-center rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm font-medium text-on-surface-variant">
                      v{selected.version}
                    </div>
                  </div>
                  <div className="min-w-[160px] max-w-[220px] flex-1 space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={draft.status}
                      disabled={locked}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, status: e.target.value as TemplateRow['status'] } : prev))}
                    >
                      <option value="draft">{STATUS_LABELS.draft}</option>
                      <option value="review">{STATUS_LABELS.review}</option>
                      {/* Active can only be reached through the Activate button below, which
                          also deactivates whichever template was previously live — picking
                          it here would skip that and leave two templates reading "Active". */}
                      <option value="active" disabled>{STATUS_LABELS.active}</option>
                      <option value="archived">{STATUS_LABELS.archived}</option>
                    </Select>
                  </div>
                  {selected.usedCount > 0 ? (
                    <div className="min-w-[160px] max-w-[220px] flex-1 space-y-1.5">
                      <Label>Registered applications</Label>
                      <div className="flex h-12 items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm font-medium text-on-surface">
                        <MaterialSymbol name="groups" size="text-base" className="text-on-surface-variant" />
                        {selected.usedCount}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
                  <Button type="button" size="sm" disabled={locked || !isDirty || persistDraft.isPending} onClick={() => void handleSave()}>
                    <MaterialSymbol name="save" size="text-base" />
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={locked || persistDraft.isPending || draft.status === 'review' || selected.is_active}
                    title="Saves your changes and marks this template ready for a second pair of eyes"
                    onClick={() => void handleSubmitForReview()}
                  >
                    <MaterialSymbol name="send" size="text-base" />
                    Submit for review
                  </Button>
                  {isDirty ? (
                    <>
                      <Badge variant="warning">Unsaved changes</Badge>
                      <Button type="button" variant="ghost" size="sm" onClick={discardChanges}>
                        Discard
                      </Button>
                    </>
                  ) : null}

                  <span className="mx-1 hidden h-6 w-px bg-outline-variant sm:block" />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDirty}
                    title={lifecycleActionsDisabledTitle}
                    onClick={() => void handleDuplicate()}
                  >
                    <MaterialSymbol name="content_copy" size="text-base" />
                    Duplicate to edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isDirty || selected.is_active || selected.status === 'archived'}
                    title={lifecycleActionsDisabledTitle}
                    onClick={() => void activateSelected()}
                  >
                    <MaterialSymbol name="check_circle" size="text-base" />
                    Activate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ms-auto text-error hover:bg-error/10"
                    disabled={locked || selected.is_active || isDirty}
                    title={lifecycleActionsDisabledTitle}
                    onClick={() => void handleDelete()}
                  >
                    <MaterialSymbol name="delete" size="text-base" />
                    Delete
                  </Button>
                </div>

                {locked ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-warning">
                    <MaterialSymbol name="lock" size="text-base" className="mt-0.5 shrink-0" />
                    <p>
                      {selected.usedCount} parent{selected.usedCount === 1 ? ' has' : 's have'} registered on this template, so its questions are
                      locked and it can&apos;t be edited or deleted. Duplicate it to make changes.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 rounded-2xl border border-outline-variant bg-surface p-4">
                <Tabs defaultValue={stepOrder[0]}>
                  {/* Full width of this card (not the page) — each step gets an even share
                      instead of the row being sized to content with space left over. */}
                  <div className="-mx-1 overflow-x-auto px-1 pb-1">
                    <TabsList className="flex w-full">
                      {stepOrder.map((step) => {
                        const visible = stepHasActiveQuestions(step, draft.questions_json);
                        return (
                          <TabsTrigger key={step} value={step} className="min-w-0 flex-1 justify-center gap-1.5">
                            <MaterialSymbol name={STEP_ICONS[step]} size="text-base" />
                            <span className="truncate">{STEP_LABELS[step]}</span>
                            {!visible ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-on-surface-variant/50" title="Hidden on the live form — no active questions" />
                            ) : null}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </div>

                  {stepOrder.map((step, stepPos) => {
                    const questions = draft.questions_json.filter((question) => question.step === step);
                    const visible = stepHasActiveQuestions(step, draft.questions_json);
                    const activeCount = questions.filter((q) => q.active).length;
                    return (
                      <TabsContent key={step} value={step} className="space-y-3">
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={locked || stepPos === 0}
                            title="Move step earlier"
                            onClick={() => moveStep(step, 'up')}
                          >
                            <MaterialSymbol name="chevron_left" size="text-base" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={locked || stepPos === stepOrder.length - 1}
                            title="Move step later"
                            onClick={() => moveStep(step, 'down')}
                          >
                            <MaterialSymbol name="chevron_right" size="text-base" />
                          </Button>
                          <p className="ms-1 text-xs text-on-surface-variant">
                            {visible ? `${activeCount} active question${activeCount === 1 ? '' : 's'}` : 'Hidden on the live form — nothing active in this step'}
                          </p>
                        </div>

                        {questions.length ? (
                          <div className="space-y-2">
                            {questions.map((question, index) => (
                              <QuestionCard
                                key={question.id}
                                question={question}
                                locked={locked}
                                expanded={expandedIds.has(question.id)}
                                canMoveUp={index > 0}
                                canMoveDown={index < questions.length - 1}
                                onToggle={() => toggleExpanded(question.id)}
                                onChange={(patch) => updateQuestion(question.id, patch)}
                                onRemove={() => removeQuestion(question.id)}
                                onMoveUp={() => moveQuestion(question.id, 'up')}
                                onMoveDown={() => moveQuestion(question.id, 'down')}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-dashed border-outline-variant p-4 text-center text-xs text-on-surface-variant">
                            No questions in this step yet.
                          </p>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={locked}
                          onClick={() => addQuestion(step)}
                        >
                          <MaterialSymbol name="add" size="text-base" />
                          Add question
                        </Button>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
