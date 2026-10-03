import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_PARENT_REGISTRATION_QUESTIONS,
  REGISTRATION_QUESTION_TYPES,
  SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS,
  SYSTEM_LIST_DRIVEN_REGISTRATION_FIELD_KEYS,
  SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS,
  deriveStepOrder,
  moveQuestionInStep,
  moveStepOrder,
  type RegistrationQuestionType,
  type RegistrationTemplateQuestion,
  type RegistrationTemplateStep,
  type RegistrationTemplateStepMeta,
  type RegistrationTemplateStepsMeta,
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
  steps_json: RegistrationTemplateStepsMeta;
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
  steps_json: RegistrationTemplateStepsMeta;
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

/** Curated icon choices for the step icon picker — the current defaults above, plus a
 * broader set of icons admins can pick to personalize a step's tab. */
const STEP_ICON_CHOICES = [
  'child_care', 'family_restroom', 'diversity_1', 'diversity_3', 'groups',
  'school', 'backpack', 'menu_book',
  'health_and_safety', 'emergency', 'medication', 'vaccines', 'local_hospital',
  'wb_sunny', 'bedtime', 'restaurant', 'water_drop',
  'directions_walk', 'directions_car', 'badge', 'contact_phone',
  'description', 'fact_check', 'checklist', 'assignment', 'folder', 'event',
  'star', 'favorite', 'shield', 'verified', 'task_alt', 'celebration', 'pets', 'home',
];

function stepLabel(step: RegistrationTemplateStep, stepsMeta: RegistrationTemplateStepsMeta): string {
  return stepsMeta[step]?.label?.trim() || STEP_LABELS[step];
}

function stepIcon(step: RegistrationTemplateStep, stepsMeta: RegistrationTemplateStepsMeta): string {
  return stepsMeta[step]?.icon || STEP_ICONS[step];
}

function isStepHidden(step: RegistrationTemplateStep, stepsMeta: RegistrationTemplateStepsMeta): boolean {
  return Boolean(stepsMeta[step]?.hidden);
}

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

function normalizeStepsMeta(value: unknown): RegistrationTemplateStepsMeta {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RegistrationTemplateStepsMeta) : {};
}

function isSystemRequiredQuestion(question: RegistrationTemplateQuestion) {
  return SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS.includes(question.fieldKey as (typeof SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS)[number]);
}

function isSystemAlwaysActiveQuestion(question: RegistrationTemplateQuestion) {
  return SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS.includes(question.fieldKey as (typeof SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS)[number]);
}

/** This field's widget and choices come from live system data (e.g. the real nursery list),
 * not from this question's type/options/validation — editing those here has no effect on what
 * parents actually see, so the editor locks them instead of pretending they do something. */
function isSystemListDrivenQuestion(question: RegistrationTemplateQuestion) {
  return SYSTEM_LIST_DRIVEN_REGISTRATION_FIELD_KEYS.includes(question.fieldKey as (typeof SYSTEM_LIST_DRIVEN_REGISTRATION_FIELD_KEYS)[number]);
}

/** A step with nothing active in it won't actually appear on the live signup form —
 * surfacing that here keeps the editor honest about what parents will see. */
function stepHasActiveQuestions(step: RegistrationTemplateStep, questions: RegistrationTemplateQuestion[]) {
  return questions.some((question) => question.step === step && question.active);
}

/** A custom-styled stand-in for the native `<select>` — scoped to this file so the rest of
 * the app's `<Select>` usages (several of which spread react-hook-form's `register()` onto a
 * real `<select>` element) are untouched. Matches the Template picker dropdown above it. */
function InlineSelect<T extends string>({
  value,
  disabled,
  options,
  onChange,
  className,
}: {
  value: T;
  disabled?: boolean;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-12 w-full justify-between bg-surface-container-lowest font-normal', className)}
        >
          <span className="truncate">{current?.label ?? value}</span>
          <MaterialSymbol name="expand_more" size="text-base" className="shrink-0 text-on-surface-variant" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-[160px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            disabled={option.disabled}
            onSelect={() => onChange(option.value)}
            className={cn('justify-between', option.value === value && 'bg-primary/5 font-medium text-primary')}
          >
            {option.label}
            {option.value === value ? <MaterialSymbol name="check" size="text-base" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const systemListDriven = isSystemListDrivenQuestion(question);
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
              {systemListDriven ? (
                <div className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant">
                  <MaterialSymbol name="lock" size="text-base" className="shrink-0" />
                  Managed by the nursery list
                </div>
              ) : (
                <InlineSelect
                  value={question.type}
                  disabled={locked}
                  onChange={(type) => onChange({ type })}
                  options={REGISTRATION_QUESTION_TYPES.map((type) => ({ value: type, label: type.replace('_', ' ') }))}
                />
              )}
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

          {systemListDriven ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-xs text-on-surface-variant">
              <MaterialSymbol name="info" size="text-base" className="mt-0.5 shrink-0" />
              <p>
                This question&apos;s choices always come from your live nursery list — answer options and validation
                aren&apos;t shown here because they&apos;d have no effect on what parents see.
              </p>
            </div>
          ) : isChoiceType ? (
            // Min/max length, numeric range, and regex all check a free-typed value — none of
            // them mean anything once the answer can only be one of the options below, so
            // Validation is skipped entirely here rather than showing controls that do nothing.
            <div className="space-y-1.5">
              <Label>Answer options</Label>
              <div className="space-y-2">
                {(question.options ?? []).map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option}
                      disabled={locked}
                      placeholder={`Option ${index + 1}`}
                      onChange={(e) => {
                        const next = [...(question.options ?? [])];
                        next[index] = e.target.value;
                        onChange({ options: next });
                      }}
                    />
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onChange({ options: (question.options ?? []).filter((_, i) => i !== index) })}
                      title="Remove option"
                      aria-label="Remove option"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-high hover:text-error disabled:pointer-events-none disabled:opacity-40"
                    >
                      <MaterialSymbol name="close" size="text-base" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={() => onChange({ options: [...(question.options ?? []), ''] })}
                >
                  <MaterialSymbol name="add" size="text-base" />
                  Add option
                </Button>
              </div>
              <p className="text-xs text-on-surface-variant">This is what parents choose from.</p>
            </div>
          ) : (
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
          )}

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

function StepIconPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (icon: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          title="Change step icon"
          aria-label="Change step icon"
          className="h-10 w-10 shrink-0"
        >
          <MaterialSymbol name={value} size="text-lg" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <p className="mb-1.5 px-1 text-xs font-medium text-on-surface-variant">Choose an icon</p>
        <div className="grid grid-cols-6 gap-1">
          {STEP_ICON_CHOICES.map((icon) => (
            <DropdownMenuItem
              key={icon}
              onSelect={() => onChange(icon)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md p-0',
                icon === value ? 'bg-primary/15 text-primary' : 'text-on-surface-variant',
              )}
            >
              <MaterialSymbol name={icon} size="text-lg" />
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
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
        ...(row as Omit<TemplateRow, 'questions_json' | 'steps_json'>),
        questions_json: normalizeQuestions(row.questions_json),
        steps_json: normalizeStepsMeta(row.steps_json),
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
        ? {
            id: selected.id,
            name: selected.name,
            status: selected.status,
            questions_json: selected.questions_json,
            steps_json: selected.steps_json,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const isDirty = Boolean(
    draft &&
      selected &&
      (draft.name !== selected.name ||
        draft.status !== selected.status ||
        JSON.stringify(draft.questions_json) !== JSON.stringify(selected.questions_json) ||
        JSON.stringify(draft.steps_json) !== JSON.stringify(selected.steps_json)),
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
          steps_json: source.steps_json,
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
      const payload = {
        name: draft.name,
        status: statusOverride ?? draft.status,
        questions_json: draft.questions_json,
        steps_json: draft.steps_json,
      };
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
    setDraft({
      id: selected.id,
      name: selected.name,
      status: selected.status,
      questions_json: selected.questions_json,
      steps_json: selected.steps_json,
    });
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

  const updateStepMeta = (step: RegistrationTemplateStep, patch: Partial<RegistrationTemplateStepMeta>) => {
    if (!draft || locked) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next: RegistrationTemplateStepMeta = { ...prev.steps_json[step], ...patch };
      if (!next.label?.trim()) delete next.label;
      if (!next.icon) delete next.icon;
      if (!next.hidden) delete next.hidden;
      const steps_json = { ...prev.steps_json };
      if (Object.keys(next).length) steps_json[step] = next;
      else delete steps_json[step];
      return { ...prev, steps_json };
    });
  };

  const resetStepMeta = (step: RegistrationTemplateStep) => {
    if (!draft || locked) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const steps_json = { ...prev.steps_json };
      delete steps_json[step];
      return { ...prev, steps_json };
    });
  };

  const stepOrder = draft ? deriveStepOrder(draft.questions_json) : [];

  // Reordering a step shifts its position within the (horizontally scrollable) tab strip —
  // without this, the strip's scroll position stays put, so the tabs visible in the old
  // scroll window can silently change out from under the admin, looking like a step vanished.
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const stepOrderKey = stepOrder.join(',');
  useEffect(() => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[data-state="active"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [stepOrderKey]);

  if (!nurseryId) return null;

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
                  className="w-full justify-between bg-surface font-normal"
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
                    <InlineSelect
                      value={draft.status}
                      disabled={locked}
                      onChange={(status) => setDraft((prev) => (prev ? { ...prev, status } : prev))}
                      options={[
                        { value: 'draft', label: STATUS_LABELS.draft },
                        { value: 'review', label: STATUS_LABELS.review },
                        // Active can only be reached through the Activate button below, which
                        // also deactivates whichever template was previously live — picking
                        // it here would skip that and leave two templates reading "Active".
                        { value: 'active', label: STATUS_LABELS.active, disabled: true },
                        { value: 'archived', label: STATUS_LABELS.archived },
                      ]}
                    />
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
                  <div ref={tabsScrollRef} className="step-tabs-scroll -mx-1 overflow-x-auto px-1 pb-1">
                    <TabsList className="flex w-full justify-start gap-1">
                      {stepOrder.map((step) => {
                        const explicitlyHidden = isStepHidden(step, draft.steps_json);
                        const visible = !explicitlyHidden && stepHasActiveQuestions(step, draft.questions_json);
                        return (
                          <TabsTrigger key={step} value={step} className="shrink-0 gap-1.5 whitespace-nowrap">
                            <MaterialSymbol name={stepIcon(step, draft.steps_json)} size="text-base" />
                            <span>{stepLabel(step, draft.steps_json)}</span>
                            {!visible ? (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full bg-on-surface-variant/50"
                                title={explicitlyHidden ? 'Hidden from parents' : 'Hidden on the live form — no active questions'}
                              />
                            ) : null}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </div>

                  {stepOrder.map((step, stepPos) => {
                    const questions = draft.questions_json.filter((question) => question.step === step);
                    const explicitlyHidden = isStepHidden(step, draft.steps_json);
                    const visible = !explicitlyHidden && stepHasActiveQuestions(step, draft.questions_json);
                    const activeCount = questions.filter((q) => q.active).length;
                    const stepMeta = draft.steps_json[step];
                    const isCustomized = Boolean(stepMeta?.label || stepMeta?.icon);
                    return (
                      <TabsContent key={step} value={step} className="space-y-3">
                        <div className="space-y-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <StepIconPicker
                              value={stepIcon(step, draft.steps_json)}
                              disabled={locked}
                              onChange={(icon) => updateStepMeta(step, { icon })}
                            />
                            <Input
                              value={stepMeta?.label ?? ''}
                              disabled={locked}
                              placeholder={STEP_LABELS[step]}
                              className="h-10 min-w-[140px] flex-1"
                              onChange={(e) => updateStepMeta(step, { label: e.target.value })}
                            />
                            {isCustomized ? (
                              <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => resetStepMeta(step)}>
                                Reset
                              </Button>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1">
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

                            <label className="ms-2 flex items-center gap-2 text-sm text-on-surface">
                              <Checkbox
                                checked={explicitlyHidden}
                                disabled={locked}
                                onCheckedChange={(checked) => updateStepMeta(step, { hidden: checked === true })}
                              />
                              Hide from parents
                            </label>

                            <p className="ms-auto text-xs text-on-surface-variant">
                              {explicitlyHidden
                                ? "Hidden — parents won't see this step"
                                : visible
                                  ? `${activeCount} active question${activeCount === 1 ? '' : 's'}`
                                  : 'Hidden on the live form — nothing active in this step'}
                            </p>
                          </div>
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
