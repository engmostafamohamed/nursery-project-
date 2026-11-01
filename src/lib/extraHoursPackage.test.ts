// Assigning an extra-hours package: the server's refusals become messages the admin can act on.
import { describe, expect, it } from 'vitest';

import { extraHoursAssignErrorKey } from '@/lib/extraHoursPackage';

describe('extraHoursAssignErrorKey', () => {
  it('names each refusal of admin_assign_extra_hours_package', () => {
    expect(extraHoursAssignErrorKey({ message: 'extra_hours_no_parent', code: '22023' })).toBe('packages.assignErrors.noParent');
    expect(extraHoursAssignErrorKey({ message: 'extra_hours_parent_not_linked' })).toBe('packages.assignErrors.noParent');
    expect(extraHoursAssignErrorKey({ message: 'extra_hours_package_not_found' })).toBe('packages.assignErrors.packageGone');
    expect(extraHoursAssignErrorKey({ message: 'extra_hours_child_not_found' })).toBe('packages.assignErrors.childGone');
    expect(extraHoursAssignErrorKey(new Error('extra_hours_forbidden'))).toBe('packages.assignErrors.forbidden');
  });

  it('anything else is a plain failure', () => {
    expect(extraHoursAssignErrorKey(new Error('Failed to fetch'))).toBe('packages.saveFailed');
    expect(extraHoursAssignErrorKey(null)).toBe('packages.saveFailed');
  });
});
