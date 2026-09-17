import * as Crypto from 'expo-crypto';

import type { CallTrackingInput } from '@/api/calls';
import { enqueueCall } from '@/lib/offline/outbox';

/** Everything the caller knows; the cancellation fields are filled in here. */
type CancelledCallDetails = Omit<
  CallTrackingInput,
  'client_call_id' | 'call_outcome' | 'cancel_reason' | 'call_cancel_time'
>;

/**
 * The reason recorded when a rep marks Arrived and then leaves the screen
 * without starting the call or cancelling it.
 *
 * Written by the app rather than chosen by the rep, so it deliberately reads
 * differently from every entry in CANCEL_REASONS — that wording is what tells
 * a reviewer the rep never gave a reason at all. Exported so anything
 * reporting on cancellations can match it exactly instead of guessing at the
 * text.
 */
export const ABANDONED_CANCEL_REASON = 'Walked away without cancelling';

/**
 * Record a cancelled call. A cancellation never starts or ends, so
 * call_start_time / call_end_time stay NULL and the moment the rep confirmed
 * goes in call_cancel_time. Queued through the outbox, so a cancellation made
 * with no signal still reaches the server later.
 *
 * Shared by the doctor detail screen (chamber / parking) and the group panel, so
 * every cancelled row has the same shape.
 */
export async function recordCancelledCall(
  reason: string,
  details: CancelledCallDetails,
): Promise<void> {
  const payload: CallTrackingInput = {
    ...details,
    client_call_id: Crypto.randomUUID(),
    call_outcome: 'cancelled',
    cancel_reason: reason,
    call_cancel_time: new Date().toISOString(),
  };

  try {
    await enqueueCall(payload);
  } catch (error) {
    console.warn('[call] failed to queue cancellation for sync', error);
  }
}
