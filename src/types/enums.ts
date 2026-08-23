/** Matches `public.user_role` in Postgres */
export type UserRole =
  | 'xo_super_admin'
  | 'chain_super_admin'
  | 'branch_admin'
  | 'manager'
  | 'teacher'
  | 'parent';

/** Matches `public.user_department` in Postgres. Specialisation for the `manager` role. */
export type Department = 'finance' | 'hr' | 'operations';
