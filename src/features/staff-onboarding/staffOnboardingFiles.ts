/** Files outside RHF (same pattern as child enrollment). */
export type StaffOnboardingFileBundle = {
  nationalIdDoc: File | null;
  educationCerts: File | null;
  criminalCheck: File | null;
  medicalCert: File | null;
  profilePhoto: File | null;
};

export function emptyStaffOnboardingFiles(): StaffOnboardingFileBundle {
  return {
    nationalIdDoc: null,
    educationCerts: null,
    criminalCheck: null,
    medicalCert: null,
    profilePhoto: null,
  };
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC = [...ALLOWED_IMAGE, 'application/pdf'];

export function validateStaffFileSize(file: File): boolean {
  return file.size <= MAX_BYTES;
}

export function validateNationalIdDoc(file: File): boolean {
  return validateStaffFileSize(file) && ALLOWED_IMAGE.includes(file.type);
}

export function validateEducationOrCriminal(file: File): boolean {
  return validateStaffFileSize(file) && ALLOWED_DOC.includes(file.type);
}

export function validateProfilePhoto(file: File): boolean {
  return validateStaffFileSize(file) && ALLOWED_IMAGE.includes(file.type);
}

/** Education certificate required for teaching roles. */
export function isEducationCertRequired(position: string): boolean {
  return position === 'teacher' || position === 'assistant';
}
