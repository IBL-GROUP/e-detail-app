import { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { Colors } from '@/constants/theme';
import { ImageViewerModal } from '@/views/patients/ImageViewerModal';

/**
 * The doctor's visiting card — one photo, mandatory (BRD).
 *
 * The patient form's AttachmentPicker, cut down to a single image and to the
 * camera, as the Searle app has it: the card is photographed at the clinic.
 * On web, where there is no camera API, the browser's file picker stands in.
 * Compressed the same way, because it travels base64 on a clinic connection.
 */

const IMAGE_QUALITY = 0.5;

export function VisitingCardPicker({
  value,
  onChange,
  invalid = false,
}: {
  /** A local file URI, or the uploaded card's URL. Empty when none. */
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: IMAGE_QUALITY,
        });
        if (!result.canceled && result.assets[0]?.uri) onChange(result.assets[0].uri);
        return;
      }

      // Asked at the moment of use, never on mount.
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera permission needed',
          "Allow camera access in Settings to photograph the doctor's visiting card.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: IMAGE_QUALITY,
      });
      if (!result.canceled && result.assets[0]?.uri) onChange(result.assets[0].uri);
    } catch (error) {
      console.warn('[visiting-card] camera failed', error);
      Alert.alert('Could not take the photo', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <View style={styles.preview}>
        <Pressable
          onPress={() => setViewerOpen(true)}
          style={({ pressed }) => [styles.imageWrap, pressed && styles.pressed]}
        >
          <Image source={{ uri: value }} style={styles.image} resizeMode="cover" />
          <View style={styles.viewBadge}>
            <Ionicons name="expand-outline" size={12} color={Colors.textOnDark} />
          </View>
        </Pressable>
        <View style={styles.previewActions}>
          <Pressable onPress={capture} hitSlop={8} style={styles.action}>
            <Ionicons name="camera-reverse-outline" size={16} color={Colors.primary} />
            <Text style={styles.actionText}>Retake</Text>
          </Pressable>
          <Pressable onPress={() => onChange('')} hitSlop={8} style={styles.action}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={[styles.actionText, styles.removeText]}>Remove</Text>
          </Pressable>
        </View>
        <ImageViewerModal
          images={[value]}
          startIndex={viewerOpen ? 0 : null}
          onClose={() => setViewerOpen(false)}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={capture}
      style={({ pressed }) => [
        styles.addArea,
        invalid && styles.addAreaInvalid,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="camera-outline" size={22} color={Colors.primary} />
      <Text style={styles.addText}>{busy ? 'Opening camera…' : 'Capture visiting card'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The patient form's drop area, unchanged.
  addArea: {
    width: '100%',
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  addAreaInvalid: {
    borderColor: Colors.danger,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // A card is landscape, so the thumbnail is too.
  imageWrap: {
    width: 140,
    height: 88,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  viewBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewActions: {
    gap: 12,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  removeText: {
    color: Colors.danger,
  },
});
