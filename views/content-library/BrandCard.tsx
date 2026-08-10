import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';

import type { TeamBrand } from '@/api/content';
import { Tag } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { shortSkuName } from '@/lib/skuName';
import { BrandImageViewer } from './BrandImageViewer';

interface BrandCardProps {
  brand: TeamBrand;
}

/** Images shown in the card preview before the rest collapse into a "+N" tile. */
const PREVIEW_LIMIT = 3;

/**
 * One brand as a tile: a preview of its content, then the name and what's under
 * it. Tapping opens the images full screen — read-only, a rep never edits
 * content from the app.
 */
export function BrandCard({ brand }: BrandCardProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const images = brand.slideUrls ?? [];
  const preview = images.slice(0, PREVIEW_LIMIT);
  const hiddenCount = images.length - preview.length;
  const hasSkus = brand.skus.length > 0;

  return (
    <>
      <Pressable
        onPress={() => images.length > 0 && setViewerIndex(0)}
        disabled={images.length === 0}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.preview}>
          {preview.length > 0 ? (
            preview.map((url, position) => {
              const isLastPreview = position === preview.length - 1;
              return (
                <View key={url} style={styles.previewTile}>
                  <ExpoImage
                    source={{ uri: url }}
                    style={styles.previewImage}
                    contentFit="cover"
                    transition={150}
                    // Slides are cached for offline use; reuse that cache here.
                    cachePolicy="memory-disk"
                  />
                  {isLastPreview && hiddenCount > 0 ? (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreText}>+{hiddenCount}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyPreview}>
              <Ionicons name="images-outline" size={26} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No images</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.brandName} numberOfLines={1}>
            {brand.brandName}
          </Text>
          <Text style={styles.brandMeta} numberOfLines={1}>
            {hasSkus
              ? `${brand.skus.length} SKU${brand.skus.length === 1 ? '' : 's'}`
              : 'Brand-wise content'}
            {' · '}
            {brand.slideCount} image{brand.slideCount === 1 ? '' : 's'}
          </Text>

          {/* The SKUs by name. Labels drop the brand, which the heading above
              already carries, so the pills stay short enough to sit inline. */}
          {hasSkus ? (
            <View style={styles.pillRow}>
              {brand.skus.map((sku) => (
                <Tag
                  key={sku.skuName}
                  label={shortSkuName(sku.skuName, brand.brandName)}
                  tone="neutral"
                  style={styles.pill}
                />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>

      <BrandImageViewer
        title={brand.brandName}
        urls={images}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
  },
  preview: {
    flexDirection: 'row',
    gap: 4,
    height: 150,
    padding: 8,
  },
  previewTile: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  moreText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  footer: {
    gap: 3,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 14,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  // Tag is square-ish by design; fully round it so the SKUs read as pills.
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  brandMeta: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
