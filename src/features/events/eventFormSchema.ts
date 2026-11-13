import { z } from 'zod';

import { EVENT_CATEGORIES, EVENT_SCOPES, EVENT_STAGES, type EventStage } from './events';

const eventFormFieldsSchema = z.object({
  titleAr: z.string().trim().optional(),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  startsAt: z.string().min(1),
  /** Optional: when the event ends (the families plan the pickup around it). */
  endsAt: z.string().optional(),
  location: z.string().trim().optional(),
  category: z.enum(EVENT_CATEGORIES),
  targetScope: z.enum(EVENT_SCOPES),
  targetClassId: z.string().optional(),
  /** Invited children when target_scope is individual (UUID strings). */
  targetChildIds: z.array(z.string().uuid()).default([]),
  isUrgent: z.boolean().default(false),
  urgentDaysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  urgentHoursOfDay: z.array(z.number().int().min(0).max(23)).default([]),
  urgentRepeatsWeekly: z.boolean().default(false),
  isPaid: z.boolean().default(false),
  price: z.coerce.number().optional(),
  permissionDeadline: z.string().optional(),
});

type EventFormFields = z.infer<typeof eventFormFieldsSchema>;

function refineEventFormFields(
  values: EventFormFields,
  ctx: z.RefinementCtx,
  options: { requireFutureStart: boolean; requireIndividualChildren?: boolean },
) {
  const ar = values.titleAr?.length ? values.titleAr : '';
  const en = values.titleEn?.length ? values.titleEn : '';
  if (!ar && !en) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['titleAr'], message: 'titleRequired' });
  }
  const start = new Date(values.startsAt);
  if (Number.isNaN(start.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startsAt'], message: 'startInvalid' });
    return;
  }
  if (options.requireFutureStart && start <= new Date()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startsAt'], message: 'startInFuture' });
  }
  const endRaw = values.endsAt?.trim();
  if (endRaw) {
    const end = new Date(endRaw);
    if (Number.isNaN(end.getTime()) || end <= start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'endAfterStart' });
    }
  }
  if (values.isPaid && (values.price === undefined || Number.isNaN(values.price) || values.price <= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'amountPositive' });
  }
  const hasUrgentSchedule = values.urgentDaysOfWeek.length > 0 || values.urgentHoursOfDay.length > 0;
  if (values.isUrgent && (values.urgentRepeatsWeekly || hasUrgentSchedule)) {
    if (values.urgentDaysOfWeek.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['urgentDaysOfWeek'], message: 'urgentDaysRequired' });
    }
    if (values.urgentHoursOfDay.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['urgentHoursOfDay'], message: 'urgentHoursRequired' });
    }
  }
  if (values.targetScope === 'class') {
    const id = values.targetClassId?.trim();
    if (!id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetClassId'], message: 'classRequired' });
    }
  }
  if (values.targetScope === 'individual' && options.requireIndividualChildren) {
    if (!values.targetChildIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetChildIds'],
        message: 'individualChildrenRequired',
      });
    }
  }
  const deadlineRaw = values.permissionDeadline?.trim();
  if (deadlineRaw) {
    const deadline = new Date(deadlineRaw);
    if (Number.isNaN(deadline.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionDeadline'], message: 'deadlineInvalid' });
    } else if (deadline >= start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionDeadline'], message: 'deadlineBeforeStart' });
    }
  }
}

/** The create form, for a draft and for publishing alike (choosing children stays optional). */
export const eventFormSchema = eventFormFieldsSchema.superRefine((values, ctx) =>
  refineEventFormFields(values, ctx, { requireFutureStart: true, requireIndividualChildren: false }),
);

export const eventEditFormSchema = eventFormFieldsSchema
  .extend({
    eventStatus: z.enum(EVENT_STAGES),
  })
  .superRefine((values, ctx) => {
    const { eventStatus, ...fields } = values;
    void eventStatus;
    refineEventFormFields(fields as EventFormFields, ctx, {
      requireFutureStart: false,
      requireIndividualChildren: false,
    });
  });

export type EventFormValues = z.output<typeof eventFormSchema>;
export type EventEditFormValues = z.output<typeof eventEditFormSchema>;

export type EventRowForEdit = {
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  starts_at: string;
  ends_at?: string | null;
  location: string | null;
  category: string;
  is_paid: boolean;
  is_urgent?: boolean | null;
  urgent_days_of_week?: number[] | null;
  urgent_hours_of_day?: number[] | null;
  urgent_repeats_weekly?: boolean | null;
  price: string | null;
  target_scope: string;
  target_class_id: string | null;
  status: string | null;
  permission_deadline: string | null;
  cancelled_at: string | null;
  /** Present when row is loaded from Supabase before narrowing. */
  nursery_id?: string;
};

export function mapDbStatusToEditForm(row: Pick<EventRowForEdit, 'cancelled_at' | 'status'>): EventStage {
  if (row.cancelled_at) return 'cancelled';
  const s = String(row.status ?? 'draft').toLowerCase();
  if (s === 'draft') return 'draft';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'active';
}

export function eventRowToEditFormValues(row: EventRowForEdit): EventEditFormValues {
  const priceNum = row.price != null && row.price !== '' ? Number(row.price) : undefined;
  return {
    titleAr: row.title_ar ?? '',
    titleEn: row.title_en ?? '',
    descriptionAr: row.description_ar ?? '',
    descriptionEn: row.description_en ?? '',
    startsAt: toLocalInput(new Date(row.starts_at)),
    endsAt: row.ends_at ? toLocalInput(new Date(row.ends_at)) : '',
    location: row.location ?? '',
    category: row.category as EventFormValues['category'],
    targetScope: row.target_scope as EventFormValues['targetScope'],
    targetClassId: row.target_class_id ?? '',
    targetChildIds: [],
    isUrgent: Boolean(row.is_urgent),
    urgentDaysOfWeek: row.urgent_days_of_week ?? [],
    urgentHoursOfDay: row.urgent_hours_of_day ?? [],
    urgentRepeatsWeekly: Boolean(row.urgent_repeats_weekly),
    isPaid: row.is_paid,
    price: priceNum !== undefined && !Number.isNaN(priceNum) ? priceNum : undefined,
    permissionDeadline: row.permission_deadline
      ? toLocalInput(new Date(row.permission_deadline))
      : '',
    eventStatus: mapDbStatusToEditForm(row),
  };
}

/**
 * The form as an events row (without the nursery or the status, which each page sets): a title in
 * one language fills the other, blanks become null, and the urgent schedule and the price are kept
 * only when the event is urgent or paid.
 */
export function eventRowPayload(v: EventFormFields) {
  const ar = v.titleAr?.trim() ?? '';
  const en = v.titleEn?.trim() ?? '';
  const urgent = v.isUrgent;
  const deadline = v.permissionDeadline?.trim();
  const end = v.endsAt?.trim();
  const classId = v.targetClassId?.trim();
  return {
    title_ar: ar || en,
    title_en: en || ar,
    description_ar: v.descriptionAr?.trim() || null,
    description_en: v.descriptionEn?.trim() || null,
    starts_at: toIso(v.startsAt),
    ends_at: end ? toIso(end) : null,
    location: v.location?.trim() || null,
    category: v.category,
    is_urgent: urgent,
    urgent_days_of_week: urgent ? v.urgentDaysOfWeek : [],
    urgent_hours_of_day: urgent ? v.urgentHoursOfDay : [],
    urgent_repeats_weekly: urgent ? v.urgentRepeatsWeekly : false,
    is_paid: v.isPaid,
    price: v.isPaid && v.price !== undefined && !Number.isNaN(v.price) ? String(v.price) : null,
    target_scope: v.targetScope,
    target_class_id: v.targetScope === 'class' && classId ? classId : null,
    permission_deadline: deadline ? toIso(deadline) : null,
  };
}

export function toIso(value: string) {
  return new Date(value).toISOString();
}

export function toLocalInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
