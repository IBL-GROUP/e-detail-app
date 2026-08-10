import { useEffect, useState } from 'react';

import { getLocalCalls, subscribeCallLedger, type LocalCall } from './callLedger';

/**
 * This device's recorded calls, kept live.
 *
 * Reloads whenever a call is recorded or accepted by the server, so any screen
 * merging the ledger into a server response updates the moment a call ends —
 * with no network involved.
 */
export function useLocalCalls(): LocalCall[] {
  const [calls, setCalls] = useState<LocalCall[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      void getLocalCalls().then((rows) => {
        if (mounted) setCalls(rows);
      });
    };

    load();
    const unsubscribe = subscribeCallLedger(load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return calls;
}
