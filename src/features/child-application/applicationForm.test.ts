import { describe, expect, it } from 'vitest';

import {
  applicationStepFieldErrors,
  childFormFromApplication,
  mergeChildInfo,
  mergeParentInfo,
  parentFormFromApplication,
} from './applicationForm';

const parentInfo = {
  full_name: 'Hany Adel',
  email: 'hany@example.com',
  phone: '01001234567',
  father: { full_name: 'Hany Adel', mobile: '01001234567', email: 'hany@example.com', job: 'Engineer' },
  mother: { full_name: 'Mona Samir', mobile: '01117654321' },
  family: { address: '5 Nile St', marital_status: 'married', emergency_contact: 'Grandma - 01012341234' },
  pickups: [{ name: 'Uncle Sami', phone: '01055551234', relation: 'uncle', authorization: 'scheduled' }],
};

describe('the application form, shared by the family and the admin', () => {
  it('reads the family from a stored application and writes it back the same', () => {
    const form = parentFormFromApplication(parentInfo, {}, null);
    expect([form.father_full_name, form.father_job, form.mother_mobile, form.address, form.marital_status, form.pickup_1_authorization]).toEqual([
      'Hany Adel', 'Engineer', '01117654321', '5 Nile St', 'married', 'scheduled',
    ]);
    const merged = mergeParentInfo(parentInfo, form);
    expect(merged.father).toMatchObject({ full_name: 'Hany Adel', job: 'Engineer', mobile: '01001234567' });
    expect(merged.mother).toMatchObject({ full_name: 'Mona Samir', mobile: '01117654321' });
    expect(merged.family).toMatchObject({ address: '5 Nile St', marital_status: 'married' });
    expect(merged.pickups).toEqual([{ name: 'Uncle Sami', phone: '01055551234', relation: 'uncle', authorization: 'scheduled' }]);
  });

  it('turns the child answers into the stored format (yes/no as booleans, allergies listed) and back', () => {
    const form = {
      ...childFormFromApplication({}, { emergency_contacts: [{ name: 'Grandma', phone: '01012341234', relationship: 'grandmother' }] }),
      first_name: 'Laila', middle_name: 'Hany', last_name: 'Adel', nickname: 'Lulu', dob: '2024-03-01', gender: 'female',
      has_allergy: true, allergy_types: ['peanuts', 'other'], allergy_details: 'Kiwi', takes_breakfast_at_home: 'Yes', nap_time_preference: 'No',
    };
    expect(form.emergency_1_name).toBe('Grandma'); // copied from the family's last child
    const info = mergeChildInfo({}, form);
    expect(info).toMatchObject({ full_name: 'Laila Hany Adel', first_name: 'Laila', gender: 'female', emergency_contacts: [{ name: 'Grandma', phone: '01012341234', relationship: 'grandmother' }] });
    expect(info.daily_care_preferences).toMatchObject({ has_allergy: true, allergy_types: ['peanuts', 'other'], allergy_other_details: 'Kiwi', takes_breakfast_at_home: true });
    const back = childFormFromApplication(info);
    expect([back.first_name, back.allergy_types, back.allergy_details, back.takes_breakfast_at_home]).toEqual(['Laila', ['peanuts', 'other'], 'Kiwi', 'Yes']);
  });

  it('asks each step for what the family application asks', () => {
    const parent = parentFormFromApplication({}, {}, null);
    const child = childFormFromApplication({});
    expect(applicationStepFieldErrors(1, parent, child)).toMatchObject({ father_full_name: 'signup.oneParentRequired', father_mobile: 'signup.oneParentRequired' });
    expect(applicationStepFieldErrors(1, { ...parent, mother_full_name: 'Mona', mother_mobile: '0111', mother_email: 'm@x.co' }, child)).toEqual({ mother_mobile: 'signup.invalidPhone' });
    expect(Object.keys(applicationStepFieldErrors(3, parent, child))).toEqual(expect.arrayContaining(['first_name', 'last_name', 'dob']));
    expect(applicationStepFieldErrors(5, parent, { ...child, has_allergy: true })).toEqual({ allergy_types: 'signup.allergyTypeRequired' });
    expect(applicationStepFieldErrors(9, parent, child)).toEqual({});
  });
});
