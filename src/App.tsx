import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary';
import { AppProviders } from '@/providers/AppProviders';
import { AppRouter } from '@/router/AppRouter';

export default function App() {
  return (
    // The outer one catches what the router's cannot: a provider that crashes.
    <AppErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </AppErrorBoundary>
  );
}
