import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';

interface ImageViewerModalProps {
  /** Image URIs — local files while queued, server URLs once uploaded. */
  images: string[];
  /** Which one to open on, or null when the viewer is closed. */
  startIndex: number | null;
  onClose: () => void;
}

/**
 * Full-screen look at an attached prescription.
 *
 * A 56px thumbnail is enough to know a photo is there and nothing like enough
 * to read a handwritten script, which is the whole point of attaching one — so
 * tapping opens it at full size, with arrows when there is more than one.
 */
export function ImageViewerModal({
  images,
  startIndex,
  onClose,
}: ImageViewerModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  // Follow the thumbnail that was actually tapped, each time it opens.
  useEffect(() => {
    if (startIndex != null) setIndex(startIndex);
  }, [startIndex]);

  const isOpen = startIndex != null && images.length > 0;
  if (!isOpen) return null;

  // Guard the index: the list can shrink under an open viewer (a photo removed
  // in the form behind it), and reading past the end would render a blank sheet.
  const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const hasMultiple = images.length > 1;

  const step = (delta: number) => {
    setIndex((current) => {
      const next = current + delta;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* The backdrop itself dismisses, so there is always a way out even if
            the close button is behind a notch. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.counter}>
            {hasMultiple ? `${safeIndex + 1} of ${images.length}` : 'Prescription'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={Colors.textOnDark} />
          </Pressable>
        </View>

        <Image
          source={{ uri: images[safeIndex] }}
          style={{ width: width * 0.92, height: height * 0.7 }}
          resizeMode="contain"
        />

        {hasMultiple ? (
          <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable onPress={() => step(-1)} hitSlop={12} style={styles.navButton}>
              <Ionicons name="chevron-back" size={22} color={Colors.textOnDark} />
            </Pressable>
            <Pressable onPress={() => step(1)} hitSlop={12} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={22} color={Colors.textOnDark} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  counter: {
    color: Colors.textOnDark,
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
