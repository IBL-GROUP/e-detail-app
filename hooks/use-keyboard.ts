import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

/**
 * Keyboard handling shared by every screen and sheet that holds a text field.
 *
 * Neither piece is optional on Android:
 *
 *  - A React Native `Modal` is its own window, and the activity's
 *    `adjustResize` does not reach it. The keyboard simply covers the bottom of
 *    the sheet, which is why the Call Summary sheet looked identical with the
 *    keyboard open and closed.
 *  - Even on a plain screen, resizing the viewport is not the same as bringing
 *    the focused field back into it. Nothing scrolls it into view on its own.
 */

/** Gap left between a focused field and the top of the keyboard. */
const KEYBOARD_GUTTER = 16;

/**
 * Height of the on-screen keyboard, 0 when it is closed.
 *
 * Subtract it from a modal sheet's max height so the sheet shrinks to the space
 * the keyboard leaves — the sheet is sized from the WINDOW height, which does
 * not change when the keyboard opens over a modal.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // `Will*` on iOS so the sheet resizes with the keyboard animation rather
    // than jumping once it has finished; Android only emits `Did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/**
 * Scrolls the focused input clear of the keyboard when it opens.
 *
 * Measures where the field actually ended up — after any resize the platform
 * did — and scrolls by the overlap alone, so it is a no-op wherever the field
 * was already visible.
 *
 * Spread the returned props onto the ScrollView:
 *
 *   const { scrollRef, scrollProps } = useKeyboardAwareScroll();
 *   <ScrollView ref={scrollRef} {...scrollProps}>
 */
export function useKeyboardAwareScroll(enabled = true) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const subscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return;

      input.measureInWindow((_x, y, _width, height) => {
        const keyboardTop =
          Dimensions.get('window').height - event.endCoordinates.height;
        const overlap = y + height + KEYBOARD_GUTTER - keyboardTop;
        if (overlap > 0) {
          scrollRef.current?.scrollTo({
            y: offsetRef.current + overlap,
            animated: true,
          });
        }
      });
    });

    return () => subscription.remove();
  }, [enabled]);

  const scrollProps = {
    // Without this the first tap on a button while the keyboard is up only
    // dismisses the keyboard, and the button needs tapping twice.
    keyboardShouldPersistTaps: 'handled' as const,
    scrollEventThrottle: 16,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
    },
  };

  return { scrollRef, scrollProps };
}
