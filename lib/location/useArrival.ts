import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

import {
  ArrivalLocationError,
  captureArrival,
  explainLocationFailure,
  startLocationWarmup,
  type ArrivalCapture,
} from './captureArrival';

export interface UseArrivalOptions {
  /**
   * Called when the rep LEAVES the screen carrying an arrival that never became
   * a call and was never cancelled — see the abandonment note below.
   *
   * Handed the arrival itself rather than reading it off state, because by the
   * time this fires the screen is on its way out and the caller needs the
   * position and timestamp that were captured, not whatever is left in state.
   */
  onAbandon?: (arrival: ArrivalCapture | null) => void;
}

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
 *
 * ABANDONMENT. An arrival that leads nowhere used to leave no trace at all: a
 * rep could mark Arrived at a doctor, switch tabs, and nothing was ever
 * recorded — not the visit, not the walk-away. `onAbandon` closes that gap. It
 * fires when the screen loses focus (or unmounts) while an arrival is still
 * outstanding, and the callers record it as a cancelled call.
 *
 * Which means there are now THREE ways an arrival can end, and the difference
 * between them is the whole point:
 *
 *   consume()  the arrival became a call — Start Call was pressed. Silent.
 *   reset()    the arrival was withdrawn deliberately — Arrived toggled back
 *              off, the specialty changed, or a cancellation was just recorded
 *              in full. Silent, because something else already said what
 *              happened (or nothing happened at all).
 *   neither    the rep walked away. THIS is what onAbandon reports.
 *
 * NO LOCATION, NO CALL. Arrived used to enable Start the instant it was tapped,
 * while the GPS fix was still on its way — a rep who tapped straight through
 * started the call with no coordinates, and the fix that landed a moment later
 * was thrown away. Offline, where a first fix takes longest, that was most
 * calls. Now `locating` covers the wait and `ready` only turns true once a
 * real position is in hand; the callers enable Start and Cancel on `ready`.
 * If no position can be had, the arrival is withdrawn and the rep is told why
 * (permission, location switched off, no signal) with a way to fix it.
 */
export function useArrival({ onAbandon }: UseArrivalOptions = {}) {
  const [arrived, setArrived] = useState(false);
  const [arrival, setArrival] = useState<ArrivalCapture | null>(null);
  /** True while the position for this arrival is being fetched. */
  const [locating, setLocating] = useState(false);
  const arrivedRef = useRef(false);
  // The captured position, mirrored into a ref: the blur handler below runs
  // outside React's render cycle and cannot read state.
  const arrivalRef = useRef<ArrivalCapture | null>(null);
  /**
   * Set once this arrival has been accounted for — by consume(), or by the
   * abandonment report itself.
   *
   * Separate from `arrivedRef` so that consuming an arrival does NOT switch the
   * button off: Start Call reads the arrival straight into its navigation
   * params, and clearing the state underneath it would flip the button mid-push
   * for no reason the rep can see.
   */
  const settledRef = useRef(false);
  /**
   * Held in a ref so the blur handler always calls the LATEST callback. It
   * closes over the doctor currently on screen, which changes as the rep moves
   * through the list, and a stale closure would file the walk-away against the
   * doctor before it.
   */
  const onAbandonRef = useRef(onAbandon);
  onAbandonRef.current = onAbandon;

  const applyArrival = useCallback((next: ArrivalCapture | null) => {
    arrivalRef.current = next;
    setArrival(next);
  }, []);

  const markArrived = useCallback(async () => {
    arrivedRef.current = true;
    settledRef.current = false;
    setArrived(true);
    setLocating(true);
    // Provisional timestamp so arrived_time exists even before the GPS fix —
    // a walk-away during the wait is still recorded with when it happened.
    applyArrival({ arrivedTime: new Date().toISOString() });
    try {
      const captured = await captureArrival();
      // Ignore the fix if the user cancelled while it was resolving.
      if (arrivedRef.current) applyArrival(captured);
    } catch (error) {
      if (!arrivedRef.current) return;
      // No position: the arrival does not stand. Withdraw it silently (nothing
      // happened yet) and tell the rep what to do about it.
      arrivedRef.current = false;
      setArrived(false);
      applyArrival(null);
      const reason = error instanceof ArrivalLocationError ? error.reason : 'no_fix';
      explainLocationFailure(reason, () => void markArrivedRef.current?.());
    } finally {
      setLocating(false);
    }
  }, [applyArrival]);
  // For the "Try again" button in the failure alert, which outlives this render.
  const markArrivedRef = useRef<(() => Promise<void>) | null>(null);
  markArrivedRef.current = markArrived;

  /** Withdraw the arrival without recording anything. */
  const reset = useCallback(() => {
    arrivedRef.current = false;
    settledRef.current = false;
    setArrived(false);
    setLocating(false);
    applyArrival(null);
  }, [applyArrival]);

  /**
   * Mark the arrival as spoken for — the rep pressed Start Call and the call
   * screen owns it from here. Deliberately leaves the visible state alone; the
   * focus reset clears it when the rep comes back.
   */
  const consume = useCallback(() => {
    settledRef.current = true;
  }, []);

  const toggleArrived = useCallback(() => {
    if (arrivedRef.current) reset();
    else void markArrived();
  }, [markArrived, reset]);

  useFocusEffect(
    useCallback(() => {
      // Returning to the screen means the previous attempt is over, completed
      // or cancelled. Arriving is the first step of a call, so the next one
      // starts from scratch — and a fresh GPS fix.
      reset();
      // Listen for position while the screen is open, so the fix is usually
      // ready by the time the rep taps Arrived.
      const stopWarmup = startLocationWarmup();

      // Leaving it with an arrival still outstanding is the walk-away.
      return () => {
        stopWarmup();
        if (!arrivedRef.current || settledRef.current) return;
        // Marked before the callback runs, so a blur followed by an unmount
        // cannot report the same walk-away twice.
        settledRef.current = true;
        onAbandonRef.current?.(arrivalRef.current);
      };
    }, [reset]),
  );

  /**
   * The arrival carries a real position. Start Call and Cancel Call are
   * enabled on this, never on `arrived` alone.
   */
  const ready =
    arrived && !locating && arrival?.latitude != null && arrival?.longitude != null;

  return { arrived, arrival, locating, ready, toggleArrived, reset, consume };
}
