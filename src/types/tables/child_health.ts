export interface ChildHealthRecordsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  blood_type: string | null;
  pediatrician_name: string | null;
  pediatrician_phone: string | null;
  pediatrician_clinic: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_notes: string | null;
  medical_documents_json: unknown;
  created_at: string;
  updated_at: string;
}

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';

export interface ChildAllergiesRow {
  id: string;
  child_id: string;
  nursery_id: string;
  allergen_name: string;
  reaction_type: string | null;
  severity: AllergySeverity;
  treatment_protocol: string | null;
  last_reaction_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildChronicConditionsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  condition_name: string;
  diagnosis_date: string | null;
  severity: string | null;
  treatment_protocol: string | null;
  trigger_factors: string | null;
  emergency_response_plan: string | null;
  created_at: string;
  updated_at: string;
}

export type MedicationAdminMethod = 'oral' | 'inhaler' | 'injection' | 'topical';
export type ParentConsentStatus = 'pending' | 'granted' | 'denied';

export interface ChildMedicationsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  name: string;
  dosage: string | null;
  administration_times: string | null;
  administration_method: MedicationAdminMethod;
  storage_requirements: string | null;
  expiry_date: string | null;
  parent_consent_status: ParentConsentStatus;
  created_at: string;
  updated_at: string;
}

export interface ChildVaccinationsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  vaccine_name: string;
  dose_number: number;
  date_administered: string | null;
  next_due_date: string | null;
  administered_by: string | null;
  batch_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildHealthAlertDismissalsRow {
  id: string;
  nursery_id: string;
  child_id: string;
  alert_fingerprint: string;
  dismissed_at: string;
  dismissed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HealthUpdateRequestStatus = 'pending' | 'done' | 'dismissed';

export interface ChildHealthUpdateRequestsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  parent_id: string;
  notes: string | null;
  status: HealthUpdateRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface ChildHealthDocumentsRow {
  id: string;
  child_id: string;
  nursery_id: string;
  storage_path: string;
  label_ar: string;
  label_en: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}
