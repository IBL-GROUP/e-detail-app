import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Locks the Android hardware back button while the screen is focused.
 *
 * Returning `true` swallows the press, so the screen can only be left by its own
 * forward navigation (e.g. End Call → analytics). Android-only by nature —
 * BackHandler never fires on iOS; the swipe-back gesture is disabled on the
 * route itself (`gestureEnabled: false`).
 */
export function useLockBack(enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

      return () => subscription.remove();
    }, [enabled])
  );
}
