import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useMieBrands, type MieBrand } from '@/api/content';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Tag } from '@/components/tag';
import { Colors } from '@/constants/theme';
import { shortSkuName } from '@/lib/skuName';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Chunk the brands into rows, in order, padding the last row so its cards keep
 * the same width as the rows above.
 */
function toRows(brands: MieBrand[], columns: number): (MieBrand | null)[][] {
  const rows: (MieBrand | null)[][] = [];

  for (let start = 0; start < brands.length; start += columns) {
    const row: (MieBrand | null)[] = brands.slice(start, start + columns);
    while (row.length < columns) row.push(null);
    rows.push(row);
  }

  return rows;
}

/**
 * The rep's whole product book — every brand and SKU mapped to them. Not the
 * forcing list: forcing is only what is being pushed right now, a subset of
 * what they carry.
 */
export default function MyBrands() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const brandsQuery = useMieBrands(user?.mieId);
  const brands = brandsQuery.data ?? [];

  // Three across on a desktop/wide window, two on a tablet, one on a phone so
  // the SKU pills stay readable.
  const columns = width >= 1000 ? 3 : width >= 640 ? 2 : 1;

  const brandRows = useMemo(() => toRows(brands, columns), [brands, columns]);

  const isEmpty = brands.length === 0;

  return (
    <ScreenLayout
      title="Portfolio"
      subtitle={user?.name}
      scrollable={false}
      showBack
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={styles.stateCard}>
            {brandsQuery.isLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.stateText}>
                {brandsQuery.isError
                  ? 'Unable to load your brands.'
                  : 'No brands assigned to you yet.'}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {brandRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.row}>
                {row.map((brand, position) => (
                  // Every slot is the SAME cell view, filled or empty, so each
                  // column resolves to an identical width on every row. Letting
                  // the card and the spacer flex on their own styles left the
                  // last row a few pixels out of line with the rows above.
                  <View
                    key={brand ? brand.brandName : `spacer-${position}`}
                    style={styles.cell}
                  >
                    {brand ? (
                      <View style={styles.card}>
                        <View style={styles.cardHead}>
                          <View style={styles.iconBubble}>
                            <Ionicons
                              name="cube-outline"
                              size={22}
                              color={Colors.primary}
                            />
                          </View>

                          <View style={styles.headText}>
                            <Text style={styles.brandName} numberOfLines={2}>
                              {brand.brandName}
                            </Text>
                            <Text style={styles.skuCount}>
                              {brand.skus.length} SKU
                              {brand.skus.length === 1 ? '' : 's'}
                            </Text>
                          </View>
                        </View>

                        {brand.skus.length > 0 ? (
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
                        ) : (
                          <Text style={styles.noSkus}>No SKUs listed</Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  // One column of one row. minWidth 0 stops a card's pills forcing the cell
  // wider than its share, which is what pushed the last row out of alignment.
  cell: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    // Fills its cell, so the bottoms line up across the row rather than ending
    // ragged.
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
    boxShadow: '0px 1px 4px rgba(43, 115, 184, 0.08)',
    elevation: 2,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  skuCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  // Tag is square-ish by design; fully round it so the SKUs read as pills.
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  noSkus: {
    fontSize: 12,
    fontStyle: 'italic',
    color: Colors.textMuted,
  },
  stateCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    alignItems: 'center',
  },
  stateText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
