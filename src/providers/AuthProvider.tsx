import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { onSignedOut, subscribeSessionEnded } from '@/lib/sessionExpiry';
import { supabase } from '@/lib/supabase';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hadSession = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Subscribe before getSession so TOKEN_REFRESHED / INITIAL_SESSION are not missed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') void onSignedOut(hadSession.current);
      hadSession.current = Boolean(nextSession);
      setSession(nextSession);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      hadSession.current = Boolean(data.session);
      setSession(data.session);
      setLoading(false);
    });

    // The app ended the session: out at once, without waiting for supabase-js's SIGNED_OUT.
    const unsubscribeSessionEnded = subscribeSessionEnded(() => {
      if (!mounted) return;
      hadSession.current = false;
      setSession(null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      unsubscribeSessionEnded();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
