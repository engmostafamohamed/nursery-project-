import { describe, expect, it } from 'vitest';

import { missingTexts } from '@/test/localeKeys';

import { STAFF_STATUS_ERROR_CODES, staffStatusErrorKey } from './staffStatusApi';

describe('deactivating a staff member', () => {
  it('has a text in English and Arabic for each refusal', () => {
    expect(missingTexts([...STAFF_STATUS_ERROR_CODES, 'network', 'failed'].map((code) => `staff.deactivateErrors.${code}`))).toEqual([]);
  });

  it('names the refusal the server gave', () => {
    expect(staffStatusErrorKey({ message: 'staff_not_yourself' })).toBe('staff.deactivateErrors.staff_not_yourself');
    expect(staffStatusErrorKey({ message: 'something else' })).toBe('staff.deactivateErrors.failed');
  });
});
