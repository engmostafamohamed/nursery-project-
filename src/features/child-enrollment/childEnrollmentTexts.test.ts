import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { ENROLLMENT_ERROR_CODES } from './childEnrollmentApi';

describe("the admin's add-child texts", () => {
  it('every text the screens name exists in English and Arabic', () => {
    const keys = textKeysIn([
      ...['ChildEnrollmentWizard.tsx', 'FamilyPicker.tsx', 'EnrollmentDocumentsStep.tsx', 'EnrollmentClassStep.tsx', 'childEnrollment.ts'].map((f) => path.join(__dirname, f)),
      path.resolve(__dirname, '../child-application/ApplicationInfoStep.tsx'),
      path.resolve(__dirname, '../child-application/DocumentUploadTile.tsx'),
      path.resolve(__dirname, '../../pages/admin/AdminChildEnrollmentPage.tsx'),
    ]);
    expect(keys.length).toBeGreaterThan(60);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        ...[...ENROLLMENT_ERROR_CODES.map((c) => c.replace('enrollment_', '')), 'network', 'failed'].map((c) => `childEnrollment.errors.${c}`),
        ...['linked', 'told', 'teachers'].map((k) => `childEnrollment.class.after.${k}`),
        ...['child_photo', 'birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address', 'medical_report', 'other'].map((d) => `applications.documentTypes.${d}`),
        'notificationTemplates.child_enrolled.title',
        'notificationTemplates.child_enrolled.body',
      ]),
    ).toEqual([]);
    expect(missingArabicPlurals(['childEnrollment.family.childCount', 'childEnrollment.family.children', 'childEnrollment.documents.missing'])).toEqual([]);
  });

  it('the family reads the notice in their language', () => {
    const params = { child: { ar: 'ليلى', en: 'Laila' } };
    expect(notificationText({ template_key: 'child_enrolled', template_params: params }, 'en').title).toBe('Laila is enrolled');
    expect(notificationText({ template_key: 'child_enrolled', template_params: params }, 'ar').title).toBe('تم تسجيل ليلى');
  });
});
