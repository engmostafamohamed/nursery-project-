import { useTranslation } from 'react-i18next';

import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { CAPACITY_MAX, capacityOf, GRADE_MAX, NAME_MAX, ROOM_MAX, type ClassDraft, type DraftField, type DraftIssue } from './classEditor';

/**
 * The class's details: its name in both languages (one is enough; the other is filled from it), its
 * age group (the ones in use are offered), room and places. Each problem shows under its field once
 * the field was left or the form sent; the places say how many children it has against them.
 */
export function ClassDetailsFields({
  draft,
  onChange,
  issues,
  shown,
  onBlur,
  gradeLevels,
  childrenCount,
  disabled,
}: {
  draft: ClassDraft;
  onChange: (patch: Partial<ClassDraft>) => void;
  issues: Partial<Record<DraftField, DraftIssue>>;
  /** Which fields show their problem (left once, or the form was sent). */
  shown: (field: DraftField) => boolean;
  onBlur: (field: DraftField) => void;
  gradeLevels: string[];
  childrenCount: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const err = (field: DraftField) => (shown(field) && issues[field] ? t(`classEditor.issues.${issues[field]}`, { max: field === 'gradeLevel' ? GRADE_MAX : field === 'roomNumber' ? ROOM_MAX : NAME_MAX }) : null);
  const capacity = capacityOf(draft);
  const capacityHint = capacity == null
    ? t('classEditor.fields.capacityHint', { max: CAPACITY_MAX })
    : childrenCount > capacity
      ? t('classEditor.fields.capacityBelow', { count: childrenCount, capacity })
      : t('classEditor.fields.capacityUse', { count: childrenCount, capacity, free: capacity - childrenCount });

  const field = (name: DraftField, props: { label: string; placeholder?: string; dir?: 'rtl' | 'ltr' | 'auto'; hint?: string; inputMode?: 'numeric'; list?: string; optional?: boolean }) => (
    <FormField id={`class-${name}`} label={props.label} optional={props.optional} error={err(name)} hint={props.hint}>
      <Input
        id={`class-${name}`}
        value={draft[name]}
        dir={props.dir}
        list={props.list}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        disabled={disabled}
        aria-invalid={Boolean(err(name))}
        className={cn(err(name) && invalidFieldClass)}
        onChange={(e) => onChange({ [name]: name === 'capacity' ? e.target.value.replace(/\D/g, '') : e.target.value } as Partial<ClassDraft>)}
        onBlur={() => onBlur(name)}
      />
    </FormField>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="class-details-fields">
      {field('nameAr', { label: t('classEditor.fields.nameAr'), placeholder: t('classEditor.fields.nameArPlaceholder'), dir: 'rtl' })}
      {field('nameEn', { label: t('classEditor.fields.nameEn'), placeholder: t('classEditor.fields.nameEnPlaceholder'), dir: 'ltr' })}
      {field('gradeLevel', { label: t('classEditor.fields.gradeLevel'), placeholder: t('classEditor.fields.gradeLevelPlaceholder'), list: 'class-grade-levels', optional: true, hint: t('classEditor.fields.gradeLevelHint') })}
      <datalist id="class-grade-levels">{gradeLevels.map((g) => <option key={g} value={g} />)}</datalist>
      {field('roomNumber', { label: t('classEditor.fields.roomNumber'), placeholder: t('classEditor.fields.roomPlaceholder'), optional: true })}
      <div className="sm:col-span-2 sm:max-w-xs">
        {field('capacity', { label: t('classEditor.fields.capacity'), placeholder: '25', inputMode: 'numeric', optional: true, hint: capacityHint })}
      </div>
    </div>
  );
}
