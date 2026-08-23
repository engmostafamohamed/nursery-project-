import type { User } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
});

export function useAuthContext(): AuthState {
  return useContext(AuthContext);
}
