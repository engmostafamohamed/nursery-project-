import { z } from 'zod';

const CATEGORIES = ['trip', 'activity', 'service', 'doctor_visit'] as const;
const TARGET_SCOPES = ['all', 'class', 'individual'] as const;

export const EVENT_EDIT_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
export type EventEditStatus = (typeof EVENT_EDIT_STATUSES)[number];

const eventFormFieldsSchema = z.object({
  titleAr: z.string().trim().optional(),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  startsAt: z.string().min(1),
  location: z.string().trim().optional(),
  category: z.enum(CATEGORIES),
  targetScope: z.enum(TARGET_SCOPES),
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

export const eventFormSchema = eventFormFieldsSchema.superRefine((values, ctx) =>
  refineEventFormFields(values, ctx, { requireFutureStart: true, requireIndividualChildren: false }),
);

/** Use when publishing from the create form. Individual child selection is optional. */
export const eventPublishFormSchema = eventFormFieldsSchema.superRefine((values, ctx) =>
  refineEventFormFields(values, ctx, { requireFutureStart: true, requireIndividualChildren: false }),
);

export const eventEditFormSchema = eventFormFieldsSchema
  .extend({
    eventStatus: z.enum(EVENT_EDIT_STATUSES),
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

export function mapDbStatusToEditForm(row: Pick<EventRowForEdit, 'cancelled_at' | 'status'>): EventEditStatus {
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

export function toIso(value: string) {
  return new Date(value).toISOString();
}

export function toLocalInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
