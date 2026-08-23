/** Files kept outside RHF so localStorage draft stays JSON-serializable. */
export type ChildEnrollmentFileBundle = {
  childPhoto: File | null;
  birthCertificate: File | null;
  marriageCertificate: File | null;
  courtOrder: File | null;
  vaccinationCard: File | null;
  pickupPhotos: (File | null)[];
};

export function emptyChildEnrollmentFiles(): ChildEnrollmentFileBundle {
  return {
    childPhoto: null,
    birthCertificate: null,
    marriageCertificate: null,
    courtOrder: null,
    vaccinationCard: null,
    pickupPhotos: [],
  };
}
