import { useLocation } from 'react-router-dom';

import { adminLinks, type AdminLinks } from '@/lib/adminLinks';

/** Where the nursery admin's pages live: /admin, or /xo-admin/nursery when XO staff open a nursery. */
export function useAdminBasePath(): '/admin' | '/xo-admin/nursery' {
  return useLocation().pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
}

/** The admin's class and staff page addresses under the current base (lib/adminLinks). */
export function useAdminLinks(): AdminLinks {
  return adminLinks(useAdminBasePath());
}
