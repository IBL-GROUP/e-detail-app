import { Colors } from '@/constants/theme';
import { ZoomableImage } from '@/components/ui/ZoomableImage';
import { Image as ExpoImage } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import { useEffect, useRef } from 'react';
import {
  ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export interface Slide {
  id: string;
  brand: string;
  // The actual brand + SKU names for this slide (for call recording); the
  // display uses `brand`/`title`/`subtitle` above.
  brandName?: string;
  skuName?: string;
  title: string;
  subtitle: string;
  bullets: string[];
  durationSeconds: number;
  image?: ImageSourcePropType;
  /**
   * What identifies this slide when its time is reported to analytics — the
   * image's path, not the on-device copy behind `image`. Absent on the demo
   * deck, which is never recorded against.
   */
  slideId?: string;
  /** The deck's own play-order value, carried through for the same reason. */
  forcing?: number | null;
}

interface SlideCardProps {
  slide: Slide;
  /**
   * False once the carousel has paged past this slide — the zoom is dropped so
   * coming back to it shows the whole slide again.
   */
  isActive?: boolean;
  /** Raised while the rep has this slide pinched in; the viewer pauses paging. */
  onZoomChange?: (isZoomed: boolean) => void;
}

const webHeroImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain' as const,
  display: 'block',
};

const webSideImageStyle = {
  width: '45%',
  height: '100%',
  objectFit: 'cover' as const,
  display: 'block',
};

/**
 * Whether a slide asset is video rather than a still.
 *
 * Decided from the EXTENSION, because that is all a slide carries — the deck
 * stores a URL, not a MIME type. The upload route writes a known extension
 * for every accepted type (EXT_BY_MIME in routes.upload.js), so the two lists
 * have to be kept in step.
 *
 * A GIF is deliberately absent: expo-image animates it, so it is a still as
 * far as this file is concerned and needs none of the machinery below.
 */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|ogv)(\?|#|$)/i;
const isVideoUri = (uri: string | null) =>
  Boolean(uri) && VIDEO_EXTENSIONS.test(String(uri));

/**
 * A video slide.
 *
 * Its own component because `useVideoPlayer` is a hook and most slides are
 * not video — branching inside SlideCard would make the hook conditional.
 *
 * PLAYS ONLY WHILE THE SLIDE IS THE ONE ON SCREEN. A rep swiping through a
 * deck would otherwise leave a video running underneath the slides after it,
 * audible to the doctor with nothing on screen to explain it. `isActive` is
 * already what the carousel uses to drop the zoom on a slide it has paged
 * past, so the video follows the same signal.
 *
 * Autoplay is deliberate: the rep navigated here to show this, and a slide
 * that sits on a still frame waiting to be pressed reads as broken mid-call.
 * Native controls are on, so pausing and seeking are one tap away.
 */
/**
 * The same thing for the WEB build.
 *
 * expo-video is not used here for the same reason `<img>` is used instead of
 * ExpoImage: the browser already has a perfectly good player, and the web
 * build leans on it.
 *
 * But a bare `<video controls>` is not enough. It sat at 0:00 until someone
 * pressed play, and it kept playing after the rep swiped to the next slide,
 * because nothing connected it to `isActive`. This does both.
 *
 * AUTOPLAY CAN BE REFUSED, and that is fine. Browsers block playback with
 * sound until the page has been interacted with, so the promise from play()
 * is caught rather than left to reject: on a refusal the slide simply shows
 * its controls and waits, which is the behaviour we had before anyway. In a
 * call the rep has already tapped through to get here, so it usually plays.
 */
function SlideVideoWeb({
  uri,
  isActive,
  style,
}: {
  uri: string;
  isActive: boolean;
  style: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (isActive) {
      // Refused autoplay is not an error worth surfacing - the controls are
      // right there.
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [isActive]);

  return <video ref={ref} src={uri} controls playsInline style={style} />;
}

function SlideVideo({
  uri,
  isActive,
  style,
  contentFit = 'contain',
}: {
  uri: string;
  isActive: boolean;
  style: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls
      allowsFullscreen
    />
  );
}

function getImageUri(source: ImageSourcePropType | undefined) {
  if (!source || Array.isArray(source) || typeof source === 'number') {
    return null;
  }

  if ('uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }

  return null;
}

export function SlideCard({ slide, isActive = true, onZoomChange }: SlideCardProps) {
  const { width, height } = useWindowDimensions();
  const shouldShowHeroImage = Boolean(slide.image) && slide.bullets.length === 0;
  const isWeb = Platform.OS === 'web';
  const isLandscape = width > height;
  const imageUri = getImageUri(slide.image);
  const isVideo = isVideoUri(imageUri);
  const heroGradientHeight = isWeb ? 260 : 180;
  const showMobileEdgeShadow = !isWeb;

  if (shouldShowHeroImage) {
    return (
      <View style={[styles.card, styles.heroCard]}>
        <View style={styles.heroImageFrame}>
          {isWeb && imageUri ? (
            // The browser zooms the whole page, so the web build needs nothing
            // of its own here.
            isVideo ? (
              <SlideVideoWeb
                uri={imageUri}
                isActive={isActive}
                style={webHeroImageStyle}
              />
            ) : (
              <img src={imageUri} alt={slide.title} style={webHeroImageStyle} />
            )
          ) : isVideo && imageUri ? (
            // No ZoomableImage around it: a video has its own controls and its
            // own fullscreen, and a pinch handler on top would fight them.
            <SlideVideo
              uri={imageUri}
              isActive={isActive}
              style={styles.heroImage}
              contentFit="contain"
            />
          ) : (
            // Tablet: pinch / double-tap into the slide's small print.
            <ZoomableImage
              source={slide.image as ImageSourcePropType}
              style={styles.heroImage}
              contentFit="contain"
              isActive={isActive}
              onZoomChange={onZoomChange}
            />
          )}
        </View>

        {showMobileEdgeShadow ? (
          <View pointerEvents="none" style={styles.heroEdgeShadow}>
            <Svg width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="callSlideLeftShadow" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#020617" stopOpacity={0.12} />
                  <Stop offset="1" stopColor="#020617" stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id="callSlideRightShadow" x1="1" y1="0" x2="0" y2="0">
                  <Stop offset="0" stopColor="#020617" stopOpacity={0.12} />
                  <Stop offset="1" stopColor="#020617" stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id="callSlideTopShadow" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#020617" stopOpacity={0.12} />
                  <Stop offset="1" stopColor="#020617" stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id="callSlideBottomEdgeShadow" x1="0" y1="1" x2="0" y2="0">
                  <Stop offset="0" stopColor="#020617" stopOpacity={0.14} />
                  <Stop offset="1" stopColor="#020617" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {isLandscape ? (
                <>
                  <Rect x="0" y="0" width="14%" height="100%" fill="url(#callSlideLeftShadow)" />
                  <Rect x="86%" y="0" width="14%" height="100%" fill="url(#callSlideRightShadow)" />
                </>
              ) : (
                <>
                  <Rect x="0" y="0" width="100%" height="14%" fill="url(#callSlideTopShadow)" />
                  <Rect x="0" y="84%" width="100%" height="16%" fill="url(#callSlideBottomEdgeShadow)" />
                </>
              )}
            </Svg>
          </View>
        ) : null}

        <View pointerEvents="none" style={[styles.heroBottomGradient, { height: heroGradientHeight }]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="callSlideBottomGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#020617" stopOpacity={0} />
                <Stop offset="0.42" stopColor="#020617" stopOpacity={isWeb ? 0.06 : 0.02} />
                <Stop offset="0.74" stopColor="#020617" stopOpacity={isWeb ? 0.36 : 0.08} />
                <Stop offset="1" stopColor="#020617" stopOpacity={isWeb ? 0.76 : 0.16} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#callSlideBottomGradient)" />
          </Svg>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <View style={styles.textBlock}>
          <Text style={styles.brand}>{slide.brand}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.subtitle}>{slide.subtitle}</Text>
          <View style={styles.bullets}>
            {slide.bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        </View>

        {slide.image ? (
          isWeb && imageUri ? (
            isVideo ? (
              <SlideVideoWeb
                uri={imageUri}
                isActive={isActive}
                style={webSideImageStyle}
              />
            ) : (
              <img src={imageUri} alt={slide.title} style={webSideImageStyle} />
            )
          ) : isVideo && imageUri ? (
            <SlideVideo
              uri={imageUri}
              isActive={isActive}
              style={styles.image}
              contentFit="cover"
            />
          ) : (
            <ExpoImage source={slide.image} style={styles.image} contentFit="cover" />
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flex: 1,
    width: '100%',
    height: '100%',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  textBlock: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    gap: 12,
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: -4,
  },
  bullets: {
    gap: 8,
    marginTop: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  bulletText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  image: {
    width: '45%',
    height: '100%',
  },
  heroImageFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroEdgeShadow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
