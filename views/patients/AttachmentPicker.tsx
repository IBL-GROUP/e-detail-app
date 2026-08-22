import { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { Colors } from '@/constants/theme';
import { ImageViewerModal } from './ImageViewerModal';

/**
 * Attach photos to a patient — a prescription, a report, the pack.
 *
 * React Native has no drag-and-drop dropzone (there is no desktop file system
 * to drag from), so this is the native equivalent: a thumbnail grid with an Add
 * tile that offers the camera or the photo library.
 *
 * Images are compressed on the way in. A raw phone photo is 3-5 MB and travels
 * to the server base64-encoded, which inflates it by a third — a rep on a weak
 * connection would never finish uploading a full-resolution one.
 */

const MAX_ATTACHMENTS = 5;
/** Enough to read a handwritten prescription, small enough to upload on 3G. */
const IMAGE_QUALITY = 0.5;

interface AttachmentPickerProps {
  /** Local file URIs and/or already-uploaded URLs. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Outlines the drop area in red when the form was submitted with none. */
  invalid?: boolean;
}

export function AttachmentPicker({
  value,
  onChange,
  invalid = false,
}: AttachmentPickerProps) {
  const [busy, setBusy] = useState(false);
  // Which attached photo the full-screen viewer is showing, or null when closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const remaining = MAX_ATTACHMENTS - value.length;

  const addPicked = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const picked = result.assets.map((asset) => asset.uri).filter(Boolean);
    if (picked.length > 0) onChange([...value, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const fromLibrary = async () => {
    // Permission is requested at the moment of use, not on mount — a rep who
    // never attaches anything is never asked.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos permission needed',
        'Allow photo access in Settings to attach a prescription to a patient.',
      );
      return;
    }
    addPicked(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: IMAGE_QUALITY,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      }),
    );
  };

  const fromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission needed',
        'Allow camera access in Settings to photograph a prescription.',
      );
      return;
    }
    addPicked(
      await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: IMAGE_QUALITY,
      }),
    );
  };

  const add = () => {
    if (remaining <= 0 || busy) return;

    // react-native-web's Alert is a no-op (`static alert() {}`), so a choice
    // dialog there would leave the button doing literally nothing. On web the
    // library picker is a plain <input type="file">, which already covers both
    // cases — the browser offers the camera itself where one exists.
    if (Platform.OS === 'web') {
      void run(fromLibrary);
      return;
    }

    Alert.alert('Add prescription', 'Where should the photo come from?', [
      { text: 'Take photo', onPress: () => run(fromCamera) },
      { text: 'Choose from library', onPress: () => run(fromLibrary) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /** Guards against a double-tap opening two pickers. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.warn('[attachments] picker failed', error);
      Alert.alert('Could not add the prescription', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, position) => position !== index));
  };

  return (
    <View style={styles.wrapper}>
      {value.length > 0 ? (
        <View style={styles.grid}>
          {value.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.thumb}>
              {/* Tapping opens it full-screen: a 72px tile is enough to know a
                  photo is attached, not enough to check it is the right one. */}
              <Pressable
                onPress={() => setViewerIndex(index)}
                style={({ pressed }) => [
                  styles.thumbPressable,
                  pressed && styles.pressed,
                ]}
              >
                <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                <View style={styles.viewBadge}>
                  <Ionicons name="expand-outline" size={11} color={Colors.textOnDark} />
                </View>
              </Pressable>
              <Pressable
                onPress={() => removeAt(index)}
                style={styles.remove}
                hitSlop={8}
              >
                <Ionicons name="close" size={13} color={Colors.textOnDark} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* Full-width drop area — the closest a phone gets to a dropzone. It sits
          under the thumbnails rather than beside them, so it stays the same
          target size however many photos are already attached. */}
      {remaining > 0 ? (
        <Pressable
          onPress={add}
          style={({ pressed }) => [
            styles.addArea,
            invalid && styles.addAreaInvalid,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="camera-outline" size={22} color={Colors.primary} />
          <Text style={styles.addText}>
            {value.length > 0 ? 'Add another prescription' : 'Add prescription'}
          </Text>
        </Pressable>
      ) : null}
      <ImageViewerModal
        images={value}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const TILE = 72;

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumb: {
    width: TILE,
    height: TILE,
    borderRadius: 8,
    overflow: 'visible',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  thumbPressable: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
    overflow: 'hidden',
  },
  viewBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: 'rgba(2, 6, 23, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 7,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full width, so it reads as a drop area rather than one more small button.
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
  pressed: {
    opacity: 0.7,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
});
