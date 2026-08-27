import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

import { captureArrival, type ArrivalCapture } from './captureArrival';

/**
 * Shared "Arrived" state for the call panels. Toggling Arrived ON captures the
 * rep's GPS position (offline-capable); toggling OFF / cancelling clears it.
 * `arrival` is what should be threaded into the call as arrived_time/lat/long.
 *
 * CLEARED WHENEVER THE SCREEN REGAINS FOCUS. An arrival belongs to ONE call —
 * its timestamp and GPS are filed with that call — and these panels sit under
 * the call screen rather than unmounting behind it, so without this the state
 * survived the call. The rep came back to a doctor still showing Arrived, and
 * the next call would have been stamped with where and when they arrived for
 * the previous one.
 */
export function useArrival() {
  const [arrived, setArrived] = useState(false);
  const [arrival, setArrival] = useState<ArrivalCapture | null>(null);
  const arrivedRef = useRef(false);

  const markArrived = useCallback(async () => {
    arrivedRef.current = true;
    setArrived(true);
    // Provisional timestamp so arrived_time exists even before the GPS fix.
    setArrival({ arrivedTime: new Date().toISOString() });
    const captured = await captureArrival();
    // Ignore the fix if the user cancelled while it was resolving.
    if (arrivedRef.current) setArrival(captured);
  }, []);

  const reset = useCallback(() => {
    arrivedRef.current = false;
    setArrived(false);
    setArrival(null);
  }, []);

  const toggleArrived = useCallback(() => {
    if (arrivedRef.current) reset();
    else void markArrived();
  }, [markArrived, reset]);

  // Returning to the screen means the previous attempt is over, completed or
  // cancelled. Arriving is the first step of a call, so the next one starts
  // from scratch — and a fresh GPS fix.
  useFocusEffect(reset);

  return { arrived, arrival, toggleArrived, reset };
}
