import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/providers/AuthProvider';
import { DatabaseConnectionGate } from '@/providers/DatabaseConnectionGate';
import { RealtimeQuerySync } from '@/providers/RealtimeQuerySync';
import { isRefreshFailure } from '@/lib/sessionFetchGuard';
import { handleFailedRequest } from '@/lib/sessionExpiry';

/** One retry, except for a session whose token could not be refreshed: that goes to sign-in. */
const retryOnce = (failureCount: number, error: unknown) => failureCount < 1 && !isRefreshFailure(error);

const queryClient = new QueryClient({
  // Any request may be the one that finds the session dead, not just the profile
  // read the route guard watches.
  queryCache: new QueryCache({ onError: handleFailedRequest }),
  mutationCache: new MutationCache({ onError: handleFailedRequest }),
  defaultOptions: {
    queries: {
      retry: retryOnce,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
      // Cache data for 5 minutes — navigating between pages won't trigger refetches.
      staleTime: 5 * 60 * 1000,
      // Keep unused cache entries for 10 minutes before garbage-collecting.
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: retryOnce,
      networkMode: 'offlineFirst',
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DatabaseConnectionGate>
          <ThemeProvider>
            <AuthProvider>
              <RealtimeQuerySync />
              {children}
            </AuthProvider>
          </ThemeProvider>
        </DatabaseConnectionGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
