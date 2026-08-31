import { Image as ExpoImage, type ImageContentFit } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

/**
 * An image a rep can pinch into.
 *
 * Detailing slides carry small print — reference footnotes, axis labels, dosage
 * tables — that is legible on a desktop browser (where the whole page zooms) and
 * not on a tablet held across a doctor's desk. This gives the tablet the same
 * reach: pinch to scale, drag to move around, double-tap to jump in and out.
 *
 * The one piece of coordination it needs is with the carousel it sits inside.
 * A zoomed image and a paging carousel both want horizontal drags, so this
 * reports its zoom state up via `onZoomChange` and the carousel disables its own
 * swipe while the image is scaled. At 1x the pan gesture is disabled and every
 * swipe pages as before, so nothing about normal detailing changes.
 */

interface ZoomableImageProps {
  source: ImageSourcePropType;
  contentFit?: ImageContentFit;
  style?: StyleProp<ViewStyle>;
  /** How far in a pinch may go. */
  maxScale?: number;
  /** Where a double-tap lands. */
  doubleTapScale?: number;
  /**
   * Fires when the image crosses between 1x and zoomed. The carousel above uses
   * it to hand over horizontal drags — see the note in the header.
   */
  onZoomChange?: (isZoomed: boolean) => void;
  /**
   * False when this image has been paged away from. Zoom is reset so returning
   * to a slide shows it whole, the way it was left on screen for the doctor.
   */
  isActive?: boolean;
}

const RESET_MS = 180;

export function ZoomableImage({
  source,
  contentFit = 'contain',
  style,
  maxScale = 4,
  doubleTapScale = 2.5,
  onZoomChange,
  isActive = true,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Measured, not assumed: the pan has to be clamped to the frame the image is
  // actually drawn in, and that is only known after layout.
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);

  /**
   * Zoom state as REACT state, not only as a shared value.
   *
   * Gesture config (`.enabled(...)`) is read when the detector renders, not on
   * every frame, so turning the pan on when the image scales up has to go
   * through a re-render. The ref beside it only exists to swallow repeats — this
   * is called from gesture callbacks that fire freely.
   */
  const [isZoomed, setIsZoomed] = useState(false);
  const isZoomedRef = useRef(false);

  const reportZoom = useCallback(
    (zoomed: boolean) => {
      if (isZoomedRef.current === zoomed) return;
      isZoomedRef.current = zoomed;
      setIsZoomed(zoomed);
      onZoomChange?.(zoomed);
    },
    [onZoomChange],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      frameWidth.value = width;
      frameHeight.value = height;
    },
    [frameHeight, frameWidth],
  );

  const resetZoom = useCallback(
    (animated: boolean) => {
      const to = (value: number) => (animated ? withTiming(value, { duration: RESET_MS }) : value);
      scale.value = to(1);
      translateX.value = to(0);
      translateY.value = to(0);
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      reportZoom(false);
    },
    [reportZoom, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  // Paged away from — drop the zoom rather than leaving a magnified corner
  // waiting on the slide the next time it comes round.
  useEffect(() => {
    if (!isActive) resetZoom(false);
  }, [isActive, resetZoom]);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      // Claim the slide the moment a second finger lands, before any scaling has
      // happened. A pinch is two fingers moving, which the carousel underneath
      // would otherwise read as a swipe and page away mid-zoom. If the rep lets
      // go without actually zooming, onEnd hands it straight back.
      runOnJS(reportZoom)(true);
    })
    .onUpdate((event) => {
      'worklet';
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, 1), maxScale);
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1.01) {
        // Pinched back out — settle exactly at 1x and re-centre, so the slide
        // is never left a pixel off true.
        scale.value = withTiming(1, { duration: RESET_MS });
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(reportZoom)(false);
        return;
      }

      savedScale.value = scale.value;
      // Zooming out can leave the image parked past its new edge; pull it back.
      const maxX = (frameWidth.value * (scale.value - 1)) / 2;
      const maxY = (frameHeight.value * (scale.value - 1)) / 2;
      translateX.value = Math.min(Math.max(translateX.value, -maxX), maxX);
      translateY.value = Math.min(Math.max(translateY.value, -maxY), maxY);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(reportZoom)(true);
    });

  const pan = Gesture.Pan()
    // Off at 1x so the carousel keeps every swipe it has today; on only once
    // there is something to move around.
    .enabled(isZoomed)
    .onUpdate((event) => {
      'worklet';
      // The image is scaled about its centre, so it overhangs the frame by half
      // the extra width on each side — that overhang is exactly how far it may
      // travel before an edge would come into view.
      const maxX = (frameWidth.value * (scale.value - 1)) / 2;
      const maxY = (frameHeight.value * (scale.value - 1)) / 2;
      translateX.value = Math.min(
        Math.max(savedTranslateX.value + event.translationX, -maxX),
        maxX,
      );
      translateY.value = Math.min(
        Math.max(savedTranslateY.value + event.translationY, -maxY),
        maxY,
      );
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((event) => {
      'worklet';
      if (scale.value > 1.01) {
        scale.value = withTiming(1, { duration: RESET_MS });
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(reportZoom)(false);
        return;
      }

      // Bring what was tapped to the middle: a point sitting `d` from the centre
      // ends up at `d * scale`, so translating by `-d * scale` lands it there.
      const offsetX = event.x - frameWidth.value / 2;
      const offsetY = event.y - frameHeight.value / 2;
      const maxX = (frameWidth.value * (doubleTapScale - 1)) / 2;
      const maxY = (frameHeight.value * (doubleTapScale - 1)) / 2;
      const nextX = Math.min(Math.max(-offsetX * doubleTapScale, -maxX), maxX);
      const nextY = Math.min(Math.max(-offsetY * doubleTapScale, -maxY), maxY);

      scale.value = withTiming(doubleTapScale, { duration: RESET_MS });
      translateX.value = withTiming(nextX, { duration: RESET_MS });
      translateY.value = withTiming(nextY, { duration: RESET_MS });
      savedScale.value = doubleTapScale;
      savedTranslateX.value = nextX;
      savedTranslateY.value = nextY;
      runOnJS(reportZoom)(true);
    });

  // Pinch and pan run together — a two-finger gesture that drifts should move
  // the image as well as scale it. The double-tap races them; it can't overlap.
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.frame, style]} onLayout={handleLayout} collapsable={false}>
        <Animated.View style={[styles.fill, animatedStyle]}>
          <ExpoImage
            source={source}
            style={styles.fill}
            contentFit={contentFit}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    // The image grows past its box when zoomed; without this it would spill over
    // the slide's bottom overlay and the carousel's neighbours.
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
