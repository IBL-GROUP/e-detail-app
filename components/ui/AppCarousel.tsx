import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';
import Carousel, { type ICarouselInstance } from 'react-native-reanimated-carousel';

/**
 * Paging is a one-finger swipe. Two fingers are a pinch — never a page turn —
 * so a zoom on a slide can't flick the carousel even in the moment before the
 * slide has told it to stand down. Module-level so the carousel's gesture isn't
 * rebuilt on every render.
 */
const configurePanGesture = (gesture: PanGesture) => {
  gesture.maxPointers(1);
};

interface AppCarouselRenderInfo<T> {
  item: T;
  index: number;
}

interface AppCarouselProps<T> {
  data: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  renderItem: (info: AppCarouselRenderInfo<T>) => React.ReactElement;
  style?: StyleProp<ViewStyle>;
  slideStyle?: StyleProp<ViewStyle>;
  widthRatio?: number;
  heightRatio?: number;
  showArrows?: boolean;
  arrowInset?: number;
  enabled?: boolean;
  testID?: string;
}

export function AppCarousel<T>({
  data,
  currentIndex,
  onIndexChange,
  renderItem,
  style,
  slideStyle,
  widthRatio = 0.8,
  heightRatio = 0.78,
  showArrows = true,
  arrowInset = 12,
  enabled = true,
  testID,
}: AppCarouselProps<T>) {
  const carouselRef = useRef<ICarouselInstance>(null);
  const syncedIndexRef = useRef(currentIndex);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const hasItems = data.length > 0;
  const hasMultipleItems = data.length > 1;
  const canSwipe = enabled && hasMultipleItems;

  const frameWidth = useMemo(
    () => Math.max(1, Math.floor(containerSize.width * widthRatio)),
    [containerSize.width, widthRatio]
  );
  const frameHeight = useMemo(
    () => Math.max(1, Math.floor(containerSize.height * heightRatio)),
    [containerSize.height, heightRatio]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setContainerSize((previous) => {
      if (previous.width === width && previous.height === height) {
        return previous;
      }

      return { width, height };
    });
  }, []);

  const handleSnapToItem = useCallback(
    (index: number) => {
      syncedIndexRef.current = index;

      if (index !== currentIndex) {
        onIndexChange(index);
      }
    },
    [currentIndex, onIndexChange]
  );

  useEffect(() => {
    if (!hasItems || !carouselRef.current) return;
    if (syncedIndexRef.current === currentIndex) return;

    syncedIndexRef.current = currentIndex;
    carouselRef.current.scrollTo({ index: currentIndex, animated: true });
  }, [currentIndex, hasItems]);

  const requestIndexChange = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= data.length || nextIndex === currentIndex) {
        return;
      }

      onIndexChange(nextIndex);
    },
    [currentIndex, data.length, onIndexChange]
  );

  if (!hasItems) {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View style={[styles.container, style]} onLayout={handleLayout} testID={testID}>
      {containerSize.width > 0 && containerSize.height > 0 && (
        <Carousel
          ref={carouselRef}
          width={frameWidth}
          height={frameHeight}
          data={data}
          loop={false}
          enabled={canSwipe}
          onConfigurePanGesture={configurePanGesture}
          pagingEnabled
          overscrollEnabled={false}
          scrollAnimationDuration={280}
          defaultIndex={currentIndex}
          onSnapToItem={handleSnapToItem}
          renderItem={({ item, index }) => (
            <View style={[styles.slideFrame, slideStyle]}>{renderItem({ item, index })}</View>
          )}
        />
      )}

      {showArrows && hasMultipleItems ? (
        <>
          <Pressable
            onPress={() => requestIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
            style={[
              styles.arrow,
              styles.arrowLeft,
              { left: arrowInset },
              currentIndex === 0 && styles.arrowHidden,
            ]}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={() => requestIndexChange(currentIndex + 1)}
            disabled={currentIndex === data.length - 1}
            style={[
              styles.arrow,
              styles.arrowRight,
              { right: arrowInset },
              currentIndex === data.length - 1 && styles.arrowHidden,
            ]}
          >
            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideFrame: {
    flex: 1,
  },
  arrow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  arrowHidden: {
    opacity: 0,
  },
});
