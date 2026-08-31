import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useTeamBrands, type TeamBrand } from '@/api/content';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { BrandCard } from './BrandCard';

/**
 * What the rep details on: every brand assigned to their team, with the SKUs
 * under it. Browsing only — the live call still drives slides from the doctor's
 * specialty forcing.
 */
export default function ContentLibrary() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const brandsQuery = useTeamBrands(user?.teamId);
  const brands = brandsQuery.data ?? [];

  // Three tiles across on a tablet/desktop, down to one on a phone.
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;

  const skuCount = useMemo(
    () => brands.reduce((total, brand) => total + brand.skus.length, 0),
    [brands]
  );

  // Tiles flex to fill their column, so a half-empty last row would stretch one
  // card across the grid. Pad it out with invisible spacers instead.
  const gridItems = useMemo<(TeamBrand | null)[]>(() => {
    if (columns === 1 || brands.length === 0) return brands;
    const remainder = brands.length % columns;
    if (remainder === 0) return brands;
    return [...brands, ...Array<null>(columns - remainder).fill(null)];
  }, [brands, columns]);

  return (
    <ScreenLayout title="Product Content for e-Detailing" subtitle={user?.team} scrollable={false} showBack>
      <FlatList
        // Changing numColumns needs a fresh list instance.
        key={`columns-${columns}`}
        data={gridItems}
        keyExtractor={(brand, position) => brand?.brandName ?? `spacer-${position}`}
        renderItem={({ item }) =>
          item ? <BrandCard brand={item} /> : <View style={styles.spacer} />
        }
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            {brandsQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.stateTitle}>Loading content...</Text>
              </View>
            ) : null}

            {brandsQuery.isError ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Unable to load content</Text>
                <Text style={styles.stateText}>
                  {brandsQuery.error instanceof Error
                    ? brandsQuery.error.message
                    : 'Unknown error'}
                </Text>
              </View>
            ) : null}

            {!brandsQuery.isLoading && !brandsQuery.isError && brands.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>No content assigned</Text>
                <Text style={styles.stateText}>
                  No brands have been assigned to your team yet.
                </Text>
              </View>
            ) : null}

            {/* The counts sit on their own surface rather than floating as bare
                text above the grid. */}
            {brands.length > 0 ? (
              <View style={styles.summaryBar}>
                <View style={styles.summaryItem}>
                  <Ionicons name="cube-outline" size={15} color={Colors.primary} />
                  <Text style={styles.summaryValue}>{brands.length}</Text>
                  <Text style={styles.summaryLabel}>
                    brand{brands.length === 1 ? '' : 's'}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryItem}>
                  <Ionicons name="pricetag-outline" size={15} color={Colors.primary} />
                  <Text style={styles.summaryValue}>{skuCount}</Text>
                  <Text style={styles.summaryLabel}>
                    SKU{skuCount === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={<View style={styles.footerSpacer} />}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  spacer: {
    flex: 1,
  },
  header: {
    gap: 12,
    paddingBottom: 4,
  },
  stateCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 6,
    alignItems: 'center',
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  stateText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  summaryBar: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.border,
  },
  footerSpacer: {
    height: 24,
  },
});
