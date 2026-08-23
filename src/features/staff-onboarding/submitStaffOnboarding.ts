import type { TFunction } from 'i18next';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';

import { buildStaffOnboardingCompletePayload } from './staffOnboardingCompletePayload';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';
import type { StaffOnboardingFileBundle } from './staffOnboardingFiles';
import { uploadStaffOnboardingFiles } from './uploadStaffOnboardingFiles';

type EdgeSuccess = {
  user_id: string;
  staff_profile_id: string;
  employee_id: string;
  schedule_error?: string;
};

export async function submitStaffOnboarding(
  v: StaffOnboardingFormValues,
  nurseryId: string,
  t: TFunction,
  files: StaffOnboardingFileBundle,
): Promise<{ employeeId: string }> {
  const payload = buildStaffOnboardingCompletePayload(v, nurseryId);
  const { data, error } = await supabase.functions.invoke('staff-onboarding-complete', {
    body: payload,
  });
  if (error) {
    // The Edge Function returns 4xx/5xx with a JSON body containing
    // { error, error_message } for known failure modes (e.g. duplicate
    // mobile/email). supabase-js doesn't surface the body on FunctionsHttpError,
    // so we re-fetch it from the embedded response and throw a clearer Error.
    const response = (error as { context?: { response?: Response } }).context?.response;
    if (response) {
      try {
        const cloned = response.clone();
        const body = (await cloned.json()) as { error?: string; error_message?: string };
        const friendly = body.error_message ?? body.error;
        if (friendly) throw new Error(friendly);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'JSON.parse') throw parseErr;
      }
    }
    throw error;
  }
  const result = data as EdgeSuccess & { error?: string };
  if (result?.error) throw new Error(result.error);
  if (!result?.staff_profile_id || !result?.employee_id) {
    throw new Error('Incomplete staff onboarding response');
  }

  if (result.schedule_error) {
    toast.error(t('staffOnboarding.schedulePartialFail'), { description: result.schedule_error });
  }

  const staffProfileId = result.staff_profile_id;
  const staffUserId = result.user_id;
  const employeeId = result.employee_id;

  const uploaded = await uploadStaffOnboardingFiles(nurseryId, staffProfileId, files, t);
  const now = new Date().toISOString();
  const documentsJson: Record<string, unknown>[] = [];
  if (uploaded.nationalIdPath) {
    documentsJson.push({ type: 'national_id', path: uploaded.nationalIdPath, uploaded_at: now });
  }
  if (uploaded.educationPath) {
    documentsJson.push({ type: 'education', path: uploaded.educationPath, uploaded_at: now });
  }
  if (uploaded.criminalPath) {
    documentsJson.push({ type: 'criminal_background', path: uploaded.criminalPath, uploaded_at: now });
  }
  if (uploaded.medicalPath) {
    documentsJson.push({ type: 'medical', path: uploaded.medicalPath, uploaded_at: now });
  }
  if (uploaded.profilePhotoPath) {
    documentsJson.push({ type: 'profile_photo', path: uploaded.profilePhotoPath, uploaded_at: now });
  }

  if (documentsJson.length > 0) {
    const { error: docErr } = await supabase
      .from('staff_profiles')
      .update({ documents_json: documentsJson } as never)
      .eq('id', staffProfileId);
    if (docErr) throw docErr;
  }

  // First-class National ID record — keyed by the staff user's UID.
  if (uploaded.nationalIdPath) {
    const { error: idErr } = await supabase
      .from('staff_national_ids')
      .upsert(
        {
          user_id: staffUserId,
          nursery_id: nurseryId,
          staff_profile_id: staffProfileId,
          document_path: uploaded.nationalIdPath,
          document_mime: files.nationalIdDoc?.type ?? null,
        } as never,
        { onConflict: 'user_id' },
      );
    if (idErr) throw idErr;
  }

  return { employeeId };
}
