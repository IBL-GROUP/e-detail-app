import { useEffect, useState } from 'react';
import { afterInteractions } from '@/lib/afterInteractions';

/**
 * False on the first render, true once the navigation transition (and any
 * touch handling) that brought this screen up has finished.
 *
 * Heavy screens render a skeleton until then, so a tap on a tab switches at
 * once and the real content — a long doctor list, a page of charts — draws a
 * moment later, instead of the tap itself waiting for all of it to render.
 */
export function useAfterInteractions(): boolean {
  const [ready, setReady] = useState(false);
  // Idle UI, or 1.5s at the latest — the content always appears.
  useEffect(() => afterInteractions(() => setReady(true)), []);
  return ready;
}
