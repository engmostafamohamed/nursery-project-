import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/providers/AuthProvider';
import { DatabaseConnectionGate } from '@/providers/DatabaseConnectionGate';
import { RealtimeQuerySync } from '@/providers/RealtimeQuerySync';
import { handleFailedRequest } from '@/lib/sessionExpiry';

const queryClient = new QueryClient({
  // Any request may be the one that finds the session dead, not just the profile
  // read the route guard watches.
  queryCache: new QueryCache({ onError: handleFailedRequest }),
  mutationCache: new MutationCache({ onError: handleFailedRequest }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
      // Cache data for 5 minutes — navigating between pages won't trigger refetches.
      staleTime: 5 * 60 * 1000,
      // Keep unused cache entries for 10 minutes before garbage-collecting.
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: 1,
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
