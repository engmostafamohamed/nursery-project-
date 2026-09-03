import { supabase } from '@/lib/supabase';

type ActivateEnrollmentResult = {
  childId: string;
  parentId: string | null;
};

export async function activateEnrollment(params: {
  applicationId: string;
  nurseryId: string;
  reviewerId?: string;
  autoGenerateFirstInvoice?: boolean;
}): Promise<ActivateEnrollmentResult> {
  const { data, error } = await supabase.rpc('approve_application_enrollment' as never, {
    p_application_id: params.applicationId,
    p_nursery_id: params.nurseryId,
    p_auto_generate_first_invoice: params.autoGenerateFirstInvoice ?? true,
  } as never);

  if (error) throw error;

  const result = data as ActivateEnrollmentResult | null;
  if (!result?.childId) throw new Error('Application approval did not return an active child');

  return result;
}
