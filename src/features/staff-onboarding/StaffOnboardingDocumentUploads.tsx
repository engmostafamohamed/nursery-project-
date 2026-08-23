import { useTranslation } from 'react-i18next';

import { StaffFileRow } from './StaffFileRow';
import type { StaffOnboardingFileBundle } from './staffOnboardingFiles';
import { validateEducationOrCriminal, validateProfilePhoto } from './staffOnboardingFiles';

type Props = {
  files: StaffOnboardingFileBundle;
  onChange: (next: StaffOnboardingFileBundle) => void;
  errors?: Partial<Record<keyof StaffOnboardingFileBundle, string>>;
  /** Hide inner heading; mark all uploads optional (recommended only). */
  documentsOptional?: boolean;
};

/** Step 7 document uploads. The National ID photo is collected at step 1
 * alongside the 14-digit number, so it is intentionally absent here. */
export function StaffOnboardingDocumentUploads({ files, onChange, errors, documentsOptional }: Props) {
  const { t } = useTranslation();
  const optional = Boolean(documentsOptional);

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant p-3">
      {!optional ? (
        <p className="text-sm font-medium">{t('staffOnboarding.step7.documentsTitle')}</p>
      ) : null}
      <StaffFileRow
        label={t('staffOnboarding.step7.docEducation')}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        file={files.educationCerts}
        optional={optional}
        errorKey={errors?.educationCerts}
        onPick={(f) => {
          if (f && !validateEducationOrCriminal(f)) return;
          onChange({ ...files, educationCerts: f });
        }}
        onClear={() => onChange({ ...files, educationCerts: null })}
      />
      <StaffFileRow
        label={t('staffOnboarding.step7.docCriminal')}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        file={files.criminalCheck}
        optional={optional}
        errorKey={errors?.criminalCheck}
        onPick={(f) => {
          if (f && !validateEducationOrCriminal(f)) return;
          onChange({ ...files, criminalCheck: f });
        }}
        onClear={() => onChange({ ...files, criminalCheck: null })}
      />
      <StaffFileRow
        label={t('staffOnboarding.step7.docMedical')}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        file={files.medicalCert}
        optional
        onPick={(f) => {
          if (f && !validateEducationOrCriminal(f)) return;
          onChange({ ...files, medicalCert: f });
        }}
        onClear={() => onChange({ ...files, medicalCert: null })}
      />
      <StaffFileRow
        label={t('staffOnboarding.step7.docProfilePhoto')}
        accept="image/jpeg,image/png,image/webp"
        file={files.profilePhoto}
        optional={optional}
        errorKey={errors?.profilePhoto}
        onPick={(f) => {
          if (f && !validateProfilePhoto(f)) return;
          onChange({ ...files, profilePhoto: f });
        }}
        onClear={() => onChange({ ...files, profilePhoto: null })}
      />
      <p className="text-xs text-on-surface-variant">{t('staffOnboarding.step7.documentsHint')}</p>
    </div>
  );
}
