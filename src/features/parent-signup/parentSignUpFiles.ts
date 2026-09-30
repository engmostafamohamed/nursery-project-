export type ParentSignUpFileBundle = {
  childPhoto: File | null;
  fatherIdPhoto: File | null;
  motherIdPhoto: File | null;
  birthCertificate: File | null;
  vaccinationCard: File | null;
  proofOfAddress: File | null;
  medicalReport: File | null;
  otherDocument: File | null;
  pickupPerson1Photo: File | null;
  pickupPerson2Photo: File | null;
};

export function emptyParentSignUpFiles(): ParentSignUpFileBundle {
  return {
    childPhoto: null,
    fatherIdPhoto: null,
    motherIdPhoto: null,
    birthCertificate: null,
    vaccinationCard: null,
    proofOfAddress: null,
    medicalReport: null,
    otherDocument: null,
    pickupPerson1Photo: null,
    pickupPerson2Photo: null,
  };
}
