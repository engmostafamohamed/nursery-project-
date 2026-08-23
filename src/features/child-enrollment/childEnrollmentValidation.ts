import { z } from 'zod';

import { isChildAgeValid } from '@/lib/onboardingDateBounds';
import { isValidInternationalMobile } from '@/lib/phoneValidation';

import { nationalId14 } from '../staff-onboarding/staffOnboardingValidation';

import type { ChildEnrollmentFileBundle } from './childEnrollmentFiles';
import type { ChildEnrollmentFormValues } from './childEnrollmentTypes';

const consentShape = z.object({
  photoClassroom: z.boolean(),
  photoWebsite: z.boolean(),
  photoSocial: z.boolean(),
  photoPromo: z.boolean(),
  fieldTrips: z.boolean(),
  emergencyMedical: z.boolean(),
  ambulance: z.boolean(),
  hospital: z.boolean(),
  surgery: z.boolean(),
  dataPrivacy: z.boolean(),
  behaviorPolicy: z.boolean(),
  pickupPolicy: z.boolean(),
  liability: z.boolean(),
});

const allergyRowSchema = z.object({
  allergenKey: z.string(),
  allergenOther: z.string(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life_threatening']),
  notes: z.string(),
  protocol: z.string(),
});

export const childEnrollmentFullSchema = z
  .object({
    nurseryLanguagePref: z.enum(['ar', 'en', 'both']),
    fullNameAr: z.string(),
    fullNameEn: z.string(),
    dob: z.string(),
    gender: z.union([z.literal(''), z.literal('male'), z.literal('female')]),
    nationality: z.string(),
    birthCertNumber: z.string(),
    bloodType: z.string(),
    hasAllergies: z.boolean(),
    allergies: z.array(allergyRowSchema),
    hasConditions: z.boolean(),
    conditions: z.array(
      z.object({
        name: z.string(),
        treatment: z.string(),
        triggers: z.string(),
        emergency: z.string(),
      }),
    ),
    hasMedications: z.boolean(),
    medications: z.array(
      z.object({
        name: z.string(),
        dosage: z.string(),
        times: z.string(),
        expiry: z.string(),
      }),
    ),
    dietaryRestrictions: z.string(),
    specialNeeds: z.string(),
    pediatricianName: z.string(),
    pediatricianPhone: z.string(),
    pediatricianClinic: z.string(),
    fatherName: z.string(),
    fatherNationalId: z.string(),
    fatherMobile: z.string(),
    fatherEmail: z.string(),
    fatherOccupation: z.string(),
    fatherWorkplace: z.string(),
    motherName: z.string(),
    motherNationalId: z.string(),
    motherMobile: z.string(),
    motherEmail: z.string(),
    motherOccupation: z.string(),
    motherWorkplace: z.string(),
    addressStreet: z.string(),
    addressDistrict: z.string(),
    addressCity: z.string(),
    addressGovernorate: z.string(),
    emergencyName: z.string(),
    emergencyRelationship: z.string(),
    emergencyMobile: z.string(),
    extraPickups: z.array(
      z.object({
        fullName: z.string(),
        relationship: z.string(),
        nationalId: z.string(),
        mobile: z.string(),
        validFrom: z.string(),
        validUntil: z.string(),
        canPickup: z.boolean(),
        canDropoff: z.boolean(),
        canMedical: z.boolean(),
      }),
    ),
    previousNursery: z.string(),
    homeLanguage: z.string(),
    toiletTraining: z.string(),
    napMinutes: z.string(),
    temperament: z.string(),
    comfortItems: z.string(),
    separationAnxiety: z.boolean(),
    religiousDenomination: z.string(),
    religiousHolidays: z.string(),
    culturalPractices: z.string(),
    custodyStatus: z.enum(['both', 'father', 'mother', 'guardian', 'court_order']),
    consents: consentShape,
    vaccinationBcg: z.string(),
    vaccinationHepB1: z.string(),
    vaccinationHepB2: z.string(),
    vaccinationHepB3: z.string(),
    vaccinationPolio: z.string(),
    vaccinationDtp: z.string(),
    vaccinationMmr: z.string(),
    signatureName: z.string(),
    signatureDate: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.fullNameAr.trim()) ctx.addIssue({ code: 'custom', path: ['fullNameAr'], message: 'required' });
    if (data.nurseryLanguagePref === 'en' || data.nurseryLanguagePref === 'both') {
      if (!data.fullNameEn.trim()) ctx.addIssue({ code: 'custom', path: ['fullNameEn'], message: 'required' });
    }
    if (!data.dob) ctx.addIssue({ code: 'custom', path: ['dob'], message: 'required' });
    else if (!isChildAgeValid(data.dob)) {
      ctx.addIssue({ code: 'custom', path: ['dob'], message: 'childEnrollment.validation.ageRangeChild' });
    }

    if (!data.gender || (data.gender !== 'male' && data.gender !== 'female')) {
      ctx.addIssue({ code: 'custom', path: ['gender'], message: 'required' });
    }

    if (!data.birthCertNumber.trim()) ctx.addIssue({ code: 'custom', path: ['birthCertNumber'], message: 'required' });

    const fTrim = data.fatherMobile.trim().replace(/\s/g, '');
    const mTrim = data.motherMobile.trim().replace(/\s/g, '');
    if (!fTrim && !mTrim) {
      ctx.addIssue({ code: 'custom', path: ['fatherMobile'], message: 'childEnrollment.validation.parentRequired' });
    } else {
      if (fTrim && !isValidInternationalMobile(fTrim)) {
        ctx.addIssue({ code: 'custom', path: ['fatherMobile'], message: 'staffOnboarding.validation.mobileInvalid' });
      }
      if (mTrim && !isValidInternationalMobile(mTrim)) {
        ctx.addIssue({ code: 'custom', path: ['motherMobile'], message: 'staffOnboarding.validation.mobileInvalid' });
      }
      const fOk = fTrim && isValidInternationalMobile(fTrim);
      const mOk = mTrim && isValidInternationalMobile(mTrim);
      if (!fOk && !mOk && (fTrim || mTrim)) {
        ctx.addIssue({ code: 'custom', path: ['fatherMobile'], message: 'childEnrollment.validation.parentRequired' });
      }
    }

    const anyConsent = Object.values(data.consents).some(Boolean);
    if (!anyConsent) ctx.addIssue({ code: 'custom', path: ['consents'], message: 'oneConsent' });

    if (!data.signatureName.trim()) ctx.addIssue({ code: 'custom', path: ['signatureName'], message: 'required' });
    if (!data.signatureDate) ctx.addIssue({ code: 'custom', path: ['signatureDate'], message: 'required' });

    if (data.hasAllergies && data.allergies.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['allergies'], message: 'addOne' });
    }
    if (data.hasAllergies) {
      data.allergies.forEach((row, i) => {
        if (!row.allergenKey.trim()) {
          ctx.addIssue({ code: 'custom', path: ['allergies', i, 'allergenKey'], message: 'required' });
        }
        if (row.allergenKey === 'other' && !row.allergenOther.trim()) {
          ctx.addIssue({ code: 'custom', path: ['allergies', i, 'allergenOther'], message: 'required' });
        }
      });
    }

    if (data.hasConditions && data.conditions.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['conditions'], message: 'addOne' });
    }
    if (data.hasMedications && data.medications.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['medications'], message: 'addOne' });
    }

    data.extraPickups.forEach((p, i) => {
      if (p.nationalId.trim() && !nationalId14.test(p.nationalId.replace(/\s/g, ''))) {
        ctx.addIssue({ code: 'custom', path: ['extraPickups', i, 'nationalId'], message: 'nationalId' });
      }
      if (p.fullName.trim() && !isValidInternationalMobile(p.mobile.replace(/\s/g, ''))) {
        ctx.addIssue({ code: 'custom', path: ['extraPickups', i, 'mobile'], message: 'staffOnboarding.validation.mobileInvalid' });
      }
    });
  });

export function validateChildStep(
  step: number,
  v: ChildEnrollmentFormValues,
  files?: ChildEnrollmentFileBundle | null,
): boolean {
  const s = step + 1;
  try {
    if (s === 1) {
      if (files && !files.birthCertificate) return false;
      if (!v.fullNameAr.trim()) return false;
      if (v.nurseryLanguagePref === 'en' || v.nurseryLanguagePref === 'both') {
        if (!v.fullNameEn.trim()) return false;
      }
      if (!v.dob || !v.birthCertNumber.trim()) return false;
      if (!isChildAgeValid(v.dob)) return false;
      if (!v.gender || (v.gender !== 'male' && v.gender !== 'female')) return false;
      return true;
    }
    if (s === 2) {
      if (v.hasAllergies && v.allergies.length === 0) return false;
      if (v.hasAllergies) {
        for (const a of v.allergies) {
          if (!a.allergenKey.trim()) return false;
          if (a.allergenKey === 'other' && !a.allergenOther.trim()) return false;
        }
      }
      if (v.hasConditions && v.conditions.length === 0) return false;
      if (v.hasMedications && v.medications.length === 0) return false;
      return true;
    }
    if (s === 3) {
      const fOk = v.fatherMobile.trim() && isValidInternationalMobile(v.fatherMobile.trim().replace(/\s/g, ''));
      const mOk = v.motherMobile.trim() && isValidInternationalMobile(v.motherMobile.trim().replace(/\s/g, ''));
      if (!fOk && !mOk) return false;
      if (!v.emergencyName.trim() || !isValidInternationalMobile(v.emergencyMobile.trim().replace(/\s/g, ''))) {
        return false;
      }
      return true;
    }
    if (s === 4) {
      for (const p of v.extraPickups) {
        if (!p.fullName.trim()) continue;
        if (!nationalId14.test(p.nationalId.replace(/\s/g, ''))) return false;
        if (!isValidInternationalMobile(p.mobile.replace(/\s/g, ''))) return false;
      }
      return true;
    }
    if (s === 5) {
      return true;
    }
    if (s === 6) {
      if (v.custodyStatus === 'court_order' && files && !files.courtOrder) return false;
      return true;
    }
    if (s === 7) {
      if (files && !files.vaccinationCard) return false;
      const anyConsent = Object.values(v.consents).some(Boolean);
      if (!anyConsent) return false;
      if (!v.signatureName.trim() || !v.signatureDate) return false;
      return true;
    }
    return true;
  } catch {
    return false;
  }
}
