import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { checkDatabaseHealth, type DatabaseHealthResult } from '@/lib/databaseHealth';
import { DatabasePendingPage } from '@/pages/setup/DatabasePendingPage';

type DatabaseConnectionState = 'checking' | 'available' | 'unavailable';

let hasReportedDatabaseFailure = false;

export function DatabaseConnectionGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<DatabaseConnectionState>('checking');
  const [failure, setFailure] = useState<DatabaseHealthResult | null>(null);

  useEffect(() => {
    let mounted = true;

    void checkDatabaseHealth().then((result) => {
      if (!mounted) return;

      if (result.ok) {
        setState('available');
        return;
      }

      if (!hasReportedDatabaseFailure) {
        hasReportedDatabaseFailure = true;
        if (!import.meta.env.DEV) {
          console.error('[database] Connection check failed:', result.message, result.cause ?? '');
        }
      }
      setFailure(result);
      setState('unavailable');
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (state === 'checking') {
    return <PageSkeleton />;
  }

  if (state === 'unavailable') {
    if (location.pathname !== '/error') {
      return <Navigate to="/error" replace state={{ from: location, databaseError: failure }} />;
    }

    return <DatabasePendingPage />;
  }

  return <>{children}</>;
}
