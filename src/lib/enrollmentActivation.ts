import { supabase } from '@/lib/supabase';

type ActivateEnrollmentResult = {
  childId: string;
  parentId: string | null;
  /** The class the child was placed in, or null while they wait to be assigned. */
  classId: string | null;
};

export async function activateEnrollment(params: {
  applicationId: string;
  nurseryId: string;
  reviewerId?: string;
  autoGenerateFirstInvoice?: boolean;
  /** The class to put the child in. Without one the child stays unassigned until staff place them. */
  classId?: string | null;
}): Promise<ActivateEnrollmentResult> {
  const { data, error } = await supabase.rpc('approve_application_enrollment' as never, {
    p_application_id: params.applicationId,
    p_nursery_id: params.nurseryId,
    p_auto_generate_first_invoice: params.autoGenerateFirstInvoice ?? true,
    // Only sent when chosen, so approving without a class works on any version of the function.
    ...(params.classId ? { p_class_id: params.classId } : {}),
  } as never);

  if (error) throw error;

  const result = data as (Omit<ActivateEnrollmentResult, 'classId'> & { classId?: string | null }) | null;
  if (!result?.childId) throw new Error('Application approval did not return an active child');

  return { ...result, classId: result.classId ?? null };
}
