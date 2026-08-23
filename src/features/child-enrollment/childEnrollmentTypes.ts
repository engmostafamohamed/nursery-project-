export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';

export type AllergyRow = {
  allergenKey: string;
  allergenOther: string;
  severity: AllergySeverity;
  notes: string;
  protocol: string;
};

export type ConditionRow = {
  name: string;
  treatment: string;
  triggers: string;
  emergency: string;
};

export type MedicationRow = {
  name: string;
  dosage: string;
  times: string;
  expiry: string;
};

export type ExtraPickupRow = {
  fullName: string;
  relationship: string;
  nationalId: string;
  mobile: string;
  validFrom: string;
  validUntil: string;
  canPickup: boolean;
  canDropoff: boolean;
  canMedical: boolean;
};

export type ChildEnrollmentFormValues = {
  nurseryLanguagePref: 'ar' | 'en' | 'both';

  fullNameAr: string;
  fullNameEn: string;
  dob: string;
  gender: '' | 'male' | 'female';
  nationality: string;
  birthCertNumber: string;

  bloodType: string;
  hasAllergies: boolean;
  allergies: AllergyRow[];
  hasConditions: boolean;
  conditions: ConditionRow[];
  hasMedications: boolean;
  medications: MedicationRow[];
  dietaryRestrictions: string;
  specialNeeds: string;
  pediatricianName: string;
  pediatricianPhone: string;
  pediatricianClinic: string;

  fatherName: string;
  fatherNationalId: string;
  fatherMobile: string;
  fatherEmail: string;
  fatherOccupation: string;
  fatherWorkplace: string;

  motherName: string;
  motherNationalId: string;
  motherMobile: string;
  motherEmail: string;
  motherOccupation: string;
  motherWorkplace: string;

  addressStreet: string;
  addressDistrict: string;
  addressCity: string;
  addressGovernorate: string;

  emergencyName: string;
  emergencyRelationship: string;
  emergencyMobile: string;

  extraPickups: ExtraPickupRow[];

  previousNursery: string;
  homeLanguage: string;
  toiletTraining: string;
  napMinutes: string;
  temperament: string;
  comfortItems: string;
  separationAnxiety: boolean;
  religiousDenomination: string;
  religiousHolidays: string;
  culturalPractices: string;

  custodyStatus: 'both' | 'father' | 'mother' | 'guardian' | 'court_order';

  consents: {
    photoClassroom: boolean;
    photoWebsite: boolean;
    photoSocial: boolean;
    photoPromo: boolean;
    fieldTrips: boolean;
    emergencyMedical: boolean;
    ambulance: boolean;
    hospital: boolean;
    surgery: boolean;
    dataPrivacy: boolean;
    behaviorPolicy: boolean;
    pickupPolicy: boolean;
    liability: boolean;
  };

  vaccinationBcg: string;
  vaccinationHepB1: string;
  vaccinationHepB2: string;
  vaccinationHepB3: string;
  vaccinationPolio: string;
  vaccinationDtp: string;
  vaccinationMmr: string;

  signatureName: string;
  signatureDate: string;
};
