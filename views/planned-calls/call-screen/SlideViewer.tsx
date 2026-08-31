import { Ionicons } from '@expo/vector-icons';
import { AppCarousel } from '@/components/ui/AppCarousel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Slide, SlideCard } from './SlideCard';

interface SlideViewerProps {
  slides: Slide[];
  isPaused?: boolean;
  onTogglePause?: () => void;
  onElapsedChange?: (seconds: number) => void;
  onSlideTimesChange?: (seconds: number[]) => void;
  onSlidesViewedChange?: (slidesViewed: number, canEndCall: boolean) => void;
}

function normalizeDuration(seconds: number) {
  return Math.max(1, Math.floor(seconds));
}

function addSlideTime(seconds: number[], index: number, duration: number) {
  if (duration <= 0) return seconds;

  const next = [...seconds];
  next[index] = (next[index] ?? 0) + duration;
  return next;
}

export function SlideViewer({
  slides,
  isPaused = false,
  onTogglePause,
  onElapsedChange,
  onSlideTimesChange,
  onSlidesViewedChange,
}: SlideViewerProps) {
  const [current, setCurrent] = useState(0);
  const [slideElapsed, setSlideElapsed] = useState(0);
  /** True while the current slide is pinched in — see the carousel below. */
  const [isZoomed, setIsZoomed] = useState(false);
  const [spentSeconds, setSpentSeconds] = useState<number[]>(() => slides.map(() => 0));
  const currentRef = useRef(0);
  const slideElapsedRef = useRef(0);

  const durations = useMemo(
    () => slides.map((slide) => normalizeDuration(slide.durationSeconds)),
    [slides]
  );
  const currentSlide = slides[current];
  const slidesKey = useMemo(() => slides.map((slide) => slide.id).join('|'), [slides]);

  const slideTimes = useMemo(
    () =>
      spentSeconds.map((spent, index) => {
        if (index === current) {
          return spent + slideElapsed;
        }

        return spent;
      }),
    [current, slideElapsed, spentSeconds]
  );
  const totalElapsed = useMemo(
    () => slideTimes.reduce((total, seconds) => total + seconds, 0),
    [slideTimes]
  );
  const progressSeconds = useMemo(
    () => slideTimes.map((seconds, index) => Math.min(seconds, durations[index] ?? 1)),
    [durations, slideTimes]
  );
  const completedSlides = useMemo(
    () =>
      progressSeconds.filter((seconds, index) => seconds >= (durations[index] ?? 1)).length,
    [durations, progressSeconds]
  );
  const allSlidesCompleted = slides.length > 0 && completedSlides >= slides.length;
  const isLastSlide = current === slides.length - 1;
  const previousSlidesCompleted =
    slides.length <= 1 ||
    progressSeconds
      .slice(0, Math.max(0, slides.length - 1))
      .every((seconds, index) => seconds >= (durations[index] ?? 1));
  const canEndCall = slides.length > 0 && (allSlidesCompleted || (isLastSlide && previousSlidesCompleted));
  const slidesViewed = slides.length > 0 ? Math.max(completedSlides, current + 1) : 0;

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    slideElapsedRef.current = slideElapsed;
  }, [slideElapsed]);

  useEffect(() => {
    setCurrent(0);
    setSlideElapsed(0);
    setSpentSeconds(Array.from({ length: slides.length }, () => 0));
    currentRef.current = 0;
    slideElapsedRef.current = 0;
  }, [slides.length, slidesKey]);

  useEffect(() => {
    onElapsedChange?.(totalElapsed);
  }, [onElapsedChange, totalElapsed]);

  useEffect(() => {
    onSlideTimesChange?.(slideTimes);
  }, [onSlideTimesChange, slideTimes]);

  useEffect(() => {
    if (slides.length === 0) {
      onSlidesViewedChange?.(0, false);
      return;
    }

    onSlidesViewedChange?.(slidesViewed, canEndCall);
  }, [canEndCall, onSlidesViewedChange, slides.length, slidesViewed]);

  useEffect(() => {
    if (isPaused || slides.length === 0) return;

    const interval = setInterval(() => {
      setSlideElapsed((elapsed) => elapsed + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [current, isPaused, slides.length]);

  const goToSlide = useCallback((target: number) => {
    const previousIndex = currentRef.current;

    if (target < 0 || target >= slides.length || target === previousIndex) {
      return;
    }

    const elapsed = slideElapsedRef.current;

    setSpentSeconds((seconds) => addSlideTime(seconds, previousIndex, elapsed));
    // A new slide always starts whole. The outgoing SlideCard resets itself too,
    // but this covers the jumps that don't go through a swipe — the arrows and
    // the dots, which stay live while zoomed.
    setIsZoomed(false);
    setCurrent(target);
    setSlideElapsed(0);
    currentRef.current = target;
    slideElapsedRef.current = 0;
  }, [slides.length]);

  if (slides.length === 0) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <AppCarousel
        data={slides}
        currentIndex={current}
        onIndexChange={goToSlide}
        style={styles.carousel}
        slideStyle={styles.slideWrapper}
        widthRatio={1}
        heightRatio={1}
        // Paging is suspended while the rep is pinched into a slide: a zoomed
        // image and a paging carousel both want horizontal drags, and dragging
        // around a magnified figure must not flick to the next slide in front of
        // the doctor. It comes straight back when they zoom out.
        enabled={!isZoomed}
        renderItem={({ item, index }) => (
          <SlideCard
            slide={item}
            isActive={index === current}
            onZoomChange={setIsZoomed}
          />
        )}
      />

      <View style={styles.bottomOverlay}>
        <View style={styles.sideRail}>
          <View style={styles.slideIdentity}>
            <Text style={styles.slideTeam} numberOfLines={1}>
              {currentSlide?.brand ?? ''}
            </Text>
            <Text style={styles.slideBrand} numberOfLines={1}>
              {currentSlide?.title ?? ''}
            </Text>
            <Text style={styles.slideSku} numberOfLines={2}>
              {currentSlide?.subtitle ?? ''}
            </Text>
          </View>
        </View>

        <View style={styles.centerRail}>
          {/* Pause/Resume button hidden */}

          {/* Spent-time value + progress bar hidden — show only the slide count. */}
          <View style={styles.slideTimer}>
            <Text style={styles.slideTimerLabel}>Slide {current + 1}/{slides.length}</Text>
          </View>

          <View style={styles.dots}>
            {slides.map((_, i) => (
              <Pressable key={i} onPress={() => goToSlide(i)}>
                <View style={[styles.dot, i === current && styles.dotActive]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sideRail} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  carousel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  slideWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 20,
    elevation: 20,
  },
  sideRail: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  centerRail: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  slideIdentity: {
    gap: 2,
    maxWidth: 220,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 18,
    marginRight: 12,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  slideTeam: {
    color: '#BFDBFE',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(2, 6, 23, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  slideBrand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
    textShadowColor: 'rgba(2, 6, 23, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  slideSku: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textShadowColor: 'rgba(2, 6, 23, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  slideTimer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.42)',
    alignItems: 'center',
    marginBottom: 2,
  },
  slideTimerLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  pauseButtonActive: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
    shadowColor: '#EF4444',
  },
  resumeButton: {
    backgroundColor: '#16A34A',
    borderColor: '#4ADE80',
    shadowColor: '#16A34A',
  },
  pauseButtonLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 20,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    width: 32,
    backgroundColor: '#FFFFFF',
  },
});
