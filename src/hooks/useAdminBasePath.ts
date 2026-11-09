import { useLocation } from 'react-router-dom';

/** Where the nursery admin's pages live: /admin, or /xo-admin/nursery when XO staff open a nursery. */
export function useAdminBasePath(): '/admin' | '/xo-admin/nursery' {
  return useLocation().pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
}
