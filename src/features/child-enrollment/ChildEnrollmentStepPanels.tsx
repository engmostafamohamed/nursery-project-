import type { ChildEnrollmentFileBundle } from './childEnrollmentFiles';
import { ChildEnrollmentChildStep } from './steps/ChildEnrollmentChildStep';
import { ChildEnrollmentConsentStep } from './steps/ChildEnrollmentConsentStep';
import { ChildEnrollmentDevStep } from './steps/ChildEnrollmentDevStep';
import { ChildEnrollmentFamilyStep } from './steps/ChildEnrollmentFamilyStep';
import { ChildEnrollmentLegalStep } from './steps/ChildEnrollmentLegalStep';
import { ChildEnrollmentMedicalStep } from './steps/ChildEnrollmentMedicalStep';
import { ChildEnrollmentPickupStep } from './steps/ChildEnrollmentPickupStep';

type Props = {
  step: number;
  files: ChildEnrollmentFileBundle;
  onFilesChange: (next: ChildEnrollmentFileBundle) => void;
};

export function ChildEnrollmentStepPanels({ step, files, onFilesChange }: Props) {
  if (step === 0) return <ChildEnrollmentChildStep files={files} onFilesChange={onFilesChange} />;
  if (step === 1) return <ChildEnrollmentMedicalStep />;
  if (step === 2) return <ChildEnrollmentFamilyStep />;
  if (step === 3) return <ChildEnrollmentPickupStep files={files} onFilesChange={onFilesChange} />;
  if (step === 4) return <ChildEnrollmentDevStep />;
  if (step === 5) return <ChildEnrollmentLegalStep files={files} onFilesChange={onFilesChange} />;
  if (step === 6) return <ChildEnrollmentConsentStep files={files} onFilesChange={onFilesChange} />;
  return null;
}
