// A staff member's first password: its shape, and that no two people get the same one.
// Run: npx deno test --no-lock supabase/functions/staff-onboarding-complete/tempPassword.test.ts
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { tempPassword } from './tempPassword.ts';

Deno.test('three groups of four, with a lower case letter, a capital and a digit, and no look-alikes', () => {
  for (let i = 0; i < 500; i++) {
    const password = tempPassword();
    assertMatch(password, /^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    assertMatch(password, /[a-z]/);
    assertMatch(password, /[A-Z]/);
    assertMatch(password, /[2-9]/);
    assert(!/[0O1lI]/.test(password), password);
  }
});

Deno.test('each person gets their own', () => {
  const passwords = new Set(Array.from({ length: 2000 }, tempPassword));
  assertEquals(passwords.size, 2000);
});
