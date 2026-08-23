import { normalizeInternationalMobile } from '@/lib/phoneValidation';
import { supabase } from '@/lib/supabase';

import type { ChildEnrollmentFileBundle } from './childEnrollmentFiles';
import type { ChildEnrollmentFormValues } from './childEnrollmentTypes';
import { uploadChildEnrollmentFiles } from './uploadChildEnrollmentFiles';

function buildExtendedJson(
  v: ChildEnrollmentFormValues,
  paths: {
    birthCertPath: string | null;
    marriageCertPath: string | null;
    courtOrderPath: string | null;
    vaccinationCardPath: string | null;
  },
): Record<string, unknown> {
  return {
    wizardVersion: 1,
    medical: {
      bloodType: v.bloodType,
      allergies: v.hasAllergies ? v.allergies : [],
      conditions: v.hasConditions ? v.conditions : [],
      medications: v.hasMedications ? v.medications : [],
      dietaryRestrictions: v.dietaryRestrictions,
      specialNeeds: v.specialNeeds,
      pediatrician: {
        name: v.pediatricianName,
        phone: v.pediatricianPhone.trim() ? normalizeInternationalMobile(v.pediatricianPhone) : '',
        clinic: v.pediatricianClinic,
      },
    },
    family: {
      father: {
        name: v.fatherName,
        nationalId: v.fatherNationalId,
        mobile: v.fatherMobile.trim() ? normalizeInternationalMobile(v.fatherMobile) : '',
        email: v.fatherEmail,
        occupation: v.fatherOccupation,
        workplace: v.fatherWorkplace,
      },
      mother: {
        name: v.motherName,
        nationalId: v.motherNationalId,
        mobile: v.motherMobile.trim() ? normalizeInternationalMobile(v.motherMobile) : '',
        email: v.motherEmail,
        occupation: v.motherOccupation,
        workplace: v.motherWorkplace,
      },
      address: {
        street: v.addressStreet,
        district: v.addressDistrict,
        city: v.addressCity,
        governorate: v.addressGovernorate,
      },
      emergency: {
        name: v.emergencyName,
        relationship: v.emergencyRelationship,
        mobile: v.emergencyMobile.trim() ? normalizeInternationalMobile(v.emergencyMobile) : '',
      },
    },
    developmental: {
      previousNursery: v.previousNursery,
      homeLanguage: v.homeLanguage,
      toiletTraining: v.toiletTraining,
      napMinutes: v.napMinutes,
      temperament: v.temperament,
      comfortItems: v.comfortItems,
      separationAnxiety: v.separationAnxiety,
      religiousDenomination: v.religiousDenomination,
      religiousHolidays: v.religiousHolidays,
      culturalPractices: v.culturalPractices,
    },
    legal: {
      custodyStatus: v.custodyStatus,
      documentPaths: {
        birthCertificate: paths.birthCertPath,
        marriageCertificate: paths.marriageCertPath,
        courtOrder: paths.courtOrderPath,
        vaccinationCard: paths.vaccinationCardPath,
      },
    },
    consents: v.consents,
    vaccinations: {
      bcg: v.vaccinationBcg,
      hepatitisB: [v.vaccinationHepB1, v.vaccinationHepB2, v.vaccinationHepB3],
      polio: v.vaccinationPolio,
      dtp: v.vaccinationDtp,
      mmr: v.vaccinationMmr,
    },
    signature: {
      name: v.signatureName,
      date: v.signatureDate,
    },
    extraPickups: v.extraPickups.map((row) => ({
      ...row,
      mobile: row.mobile.trim() ? normalizeInternationalMobile(row.mobile) : row.mobile,
    })),
  };
}

export async function submitChildEnrollment(
  v: ChildEnrollmentFormValues,
  nurseryId: string,
  files: ChildEnrollmentFileBundle,
): Promise<{ childId: string }> {
  if (!files.birthCertificate) {
    throw new Error('birthCertificateFileRequired');
  }
  if (!files.vaccinationCard) {
    throw new Error('vaccinationCardRequired');
  }
  if (v.custodyStatus === 'court_order' && !files.courtOrder) {
    throw new Error('courtOrderFileRequired');
  }

  const sessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;

  const uploaded = await uploadChildEnrollmentFiles(nurseryId, sessionId, {
    ...files,
    pickupPhotos: v.extraPickups.map((_, i) => files.pickupPhotos[i] ?? null),
  });

  const anyPhotoConsent =
    v.consents.photoClassroom ||
    v.consents.photoWebsite ||
    v.consents.photoSocial ||
    v.consents.photoPromo;

  const fatherPayload =
    v.fatherMobile.trim().length > 0
      ? {
          full_name_ar: v.fatherName.trim() || 'ولي أمر',
          full_name_en: v.fatherName.trim() || 'Parent',
          national_id: v.fatherNationalId.trim(),
          mobile: normalizeInternationalMobile(v.fatherMobile),
          email: v.fatherEmail.trim() || null,
          occupation: v.fatherOccupation.trim(),
          workplace: v.fatherWorkplace.trim(),
        }
      : null;

  const motherPayload =
    v.motherMobile.trim().length > 0
      ? {
          full_name_ar: v.motherName.trim() || 'ولي أمر',
          full_name_en: v.motherName.trim() || 'Parent',
          national_id: v.motherNationalId.trim(),
          mobile: normalizeInternationalMobile(v.motherMobile),
          email: v.motherEmail.trim() || null,
          occupation: v.motherOccupation.trim(),
          workplace: v.motherWorkplace.trim(),
        }
      : null;

  const pickups: { name: string; phone: string; relation: string | null; photo_path: string | null }[] = [];

  if (v.fatherMobile.trim()) {
    pickups.push({
      name: v.fatherName.trim() || 'Father',
      phone: normalizeInternationalMobile(v.fatherMobile),
      relation: 'Father',
      photo_path: null,
    });
  }
  if (v.motherMobile.trim()) {
    pickups.push({
      name: v.motherName.trim() || 'Mother',
      phone: normalizeInternationalMobile(v.motherMobile),
      relation: 'Mother',
      photo_path: null,
    });
  }

  v.extraPickups.forEach((row, i) => {
    if (!row.fullName.trim()) return;
    pickups.push({
      name: row.fullName.trim(),
      phone: normalizeInternationalMobile(row.mobile),
      relation: row.relationship.trim() || 'Authorized',
      photo_path: uploaded.pickupPhotoPaths[i] ?? null,
    });
  });

  const seenPhones = new Set<string>();
  const dedupedPickups = pickups.filter((p) => {
    if (seenPhones.has(p.phone)) return false;
    seenPhones.add(p.phone);
    return true;
  });

  const extended = buildExtendedJson(v, {
    birthCertPath: uploaded.birthCertPath,
    marriageCertPath: uploaded.marriageCertPath,
    courtOrderPath: uploaded.courtOrderPath,
    vaccinationCardPath: uploaded.vaccinationCardPath,
  });

  const { data, error } = await supabase.functions.invoke('child-enrollment-complete', {
    body: {
      nursery_id: nurseryId,
      child: {
        full_name_ar: v.fullNameAr.trim(),
        full_name_en: v.fullNameEn.trim() || v.fullNameAr.trim(),
        dob: v.dob,
        gender: v.gender,
        nationality: v.nationality,
        birth_certificate_number: v.birthCertNumber.trim(),
        avatar_url: uploaded.avatarPublicUrl,
        photo_privacy_restricted: !anyPhotoConsent,
      },
      enrollment_extended_json: extended,
      father: fatherPayload,
      mother: motherPayload,
      pickups: dedupedPickups,
    },
  });

  if (error) throw error;
  const payload = data as { child_id?: string; error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.child_id) throw new Error('no child id');
  return { childId: payload.child_id };
}
