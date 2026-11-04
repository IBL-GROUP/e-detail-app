import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import NetInfo from '@react-native-community/netinfo';
import { filePersister, CACHE_BUSTER, shouldPersistQuery } from '@/lib/offline/persister';

// Keep cached data for a week so the app works offline across days.
export const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

// Drive React Query's online/offline state from real connectivity, so queries
// and mutations pause when offline and resume on reconnect.
onlineManager.setEventListener((setOnline) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
  return unsubscribe;
});

// How long fetched data is considered fresh before a background refetch.
const FIVE_MIN_MS = 1000 * 60 * 5;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Online-first: when connected, hit the live API and refetch on mount /
      // reconnect. When offline, React Query pauses fetches and the screens keep
      // rendering from the persisted cache (the offline fallback). The cache is
      // still warmed once at login by runSync so the first offline day works.
      staleTime: FIVE_MIN_MS,
      gcTime: WEEK_MS,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      networkMode: 'online',
    },
    mutations: {
      // Call submissions never go through React Query mutations directly — they
      // are written to the SQLite outbox first, then flushed. Keep 'online' so
      // any incidental mutation only runs when connected.
      networkMode: 'online',
    },
  },
});

interface AppQueryProviderProps {
  children: React.ReactNode;
}

export function AppQueryProvider({ children }: AppQueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: filePersister,
        maxAge: WEEK_MS,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          // Every query holding data — a failed refresh must not drop it from
          // the device (see shouldPersistQuery).
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export { queryClient };
