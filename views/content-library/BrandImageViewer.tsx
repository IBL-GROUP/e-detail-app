import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OfflineImage } from '@/components/ui/OfflineImage';

import { AppCarousel } from '@/components/ui/AppCarousel';
import { Colors } from '@/constants/theme';

interface BrandImageViewerProps {
  title: string;
  urls: string[];
  /** Index to open on; the viewer is closed when this is null. */
  startIndex: number | null;
  onClose: () => void;
}

/**
 * Full-screen, VIEW-ONLY browser for a brand's images. Paging, swipe and arrows
 * come from AppCarousel — the same carousel the live call screen runs on — so
 * this behaves identically on phone, tablet and web. A rep can browse content
 * here but never edit or delete it.
 */
export function BrandImageViewer({
  title,
  urls,
  startIndex,
  onClose,
}: BrandImageViewerProps) {
  const [index, setIndex] = useState(0);
  const isOpen = startIndex !== null;

  // Re-seed each time it opens so the viewer lands on the image that was tapped.
  useEffect(() => {
    if (startIndex !== null) setIndex(startIndex);
  }, [startIndex]);

  if (!isOpen || urls.length === 0) return null;

  const safeIndex = Math.min(index, urls.length - 1);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <View style={styles.topText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.counter}>
              {safeIndex + 1} / {urls.length} · Image {safeIndex + 1}
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={Colors.text} />
          </Pressable>
        </View>

        <AppCarousel
          data={urls}
          currentIndex={safeIndex}
          onIndexChange={setIndex}
          style={styles.carousel}
          widthRatio={0.9}
          heightRatio={1}
          arrowInset={16}
          renderItem={({ item }) => (
            <OfflineImage
              url={item}
              style={styles.image}
              contentFit="contain"
              transition={120}
              cachePolicy="memory-disk"
            />
          )}
        />

        {urls.length > 1 ? (
          <View style={styles.filmstrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filmstripContent}
            >
              {urls.map((url, position) => (
                <Pressable key={url} onPress={() => setIndex(position)}>
                  <OfflineImage
                    url={url}
                    style={[
                      styles.thumb,
                      position === safeIndex && styles.thumbActive,
                    ]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    // absoluteFill so the overlay covers the page on web, where a transparent
    // Modal does not stretch on its own.
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingVertical: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  counter: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  carousel: {
    flex: 1,
  },
  image: {
    flex: 1,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  pressed: {
    opacity: 0.7,
  },
  filmstrip: {
    height: 62,
    paddingTop: 12,
  },
  filmstripContent: {
    gap: 10,
    paddingHorizontal: 16,
    // Keeps the strip centred when the thumbnails do not fill the width.
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    width: 64,
    height: 46,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.surface,
  },
  thumbActive: {
    borderColor: '#FFFFFF',
  },
});
