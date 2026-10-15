import { InteractionManager } from 'react-native';

/** The longest anything is ever held back waiting for the UI to go idle. */
export const MAX_IDLE_WAIT_MS = 1_500;

/**
 * Runs `task` once the UI is idle (no transition or touch handling running) —
 * but NEVER later than `maxWaitMs`, whatever is going on.
 *
 * Saves are deferred with this so they do not land in the middle of a tap. A
 * plain InteractionManager.runAfterInteractions waits for as long as ANY
 * interaction is open, and a single animation that never ends would postpone a
 * save indefinitely — which for the cache and the usage log would mean data not
 * reaching disk. The deadline rules that out: the task always runs, once.
 *
 * Returns a cancel function.
 */
export function afterInteractions(task: () => void, maxWaitMs = MAX_IDLE_WAIT_MS): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    clearTimeout(deadline);
    handle.cancel();
    task();
  };
  const deadline = setTimeout(run, maxWaitMs);
  const handle = InteractionManager.runAfterInteractions(run);
  return () => {
    done = true;
    clearTimeout(deadline);
    handle.cancel();
  };
}
