import { Colors } from '@/constants/theme';
import { ZoomableImage } from '@/components/ui/ZoomableImage';
import { Image as ExpoImage } from 'expo-image';
import { ImageSourcePropType, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  const heroGradientHeight = isWeb ? 260 : 180;
  const showMobileEdgeShadow = !isWeb;

  if (shouldShowHeroImage) {
    return (
      <View style={[styles.card, styles.heroCard]}>
        <View style={styles.heroImageFrame}>
          {isWeb && imageUri ? (
            // The browser zooms the whole page, so the web build needs nothing
            // of its own here.
            <img src={imageUri} alt={slide.title} style={webHeroImageStyle} />
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
            <img src={imageUri} alt={slide.title} style={webSideImageStyle} />
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
