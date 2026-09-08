import { AppButton } from '@/components/ui/AppButton';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DashboardNavCard } from './DashboardNavCard';

// The tutorial video (TutorialVideoCard) and the performance chart
// (MonthlyPerformanceCard) are TEMPORARILY hidden — the dashboard is now the
// four entry points below. Both components are kept for when they come back.
const NAV_CARDS: {
  label: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
  href: Href;
}[] = [
  {
    label: 'Doctors',
    description: 'Assigned doctor',
    iconName: 'people-outline',
    href: '/doctor-list',
  },
  {
    // The rep's whole product book from products/brands — every brand and SKU
    // they carry, not just what is currently being forced.
    label: 'Portfolio',
    description: 'Assigned brand and SKU ',
    iconName: 'pricetags-outline',
    href: '/my-brands',
  },
  {
    // The slide decks themselves — read-only previews of the visuals a rep
    // presents during a call. Named for the content, not the products, so it
    // doesn't read as a repeat of the Portfolio card above.
    label: 'Content',
    description: 'Product Content for e-Detailing',
    iconName: 'albums-outline',
    href: '/content-library',
  },
  {
    label: 'e-Detailing',
    description: "Report today's calls",
    iconName: 'calendar-outline',
    href: '/planned-calls',
  },
  {
    label: 'Analytics',
    description: 'View Sales & Call Performance',
    iconName: 'bar-chart-outline',
    href: '/analytics',
  },
  {
    // The rep's own patient log (patient_log) — recorded by them, listed here.
    label: 'Patients',
    description: 'Patients you have recorded',
    iconName: 'person-add-outline',
    href: '/patients',
  },
];

/**
 * The cards laid out two per row, padded so the last row keeps its shape.
 *
 * Derived from NAV_CARDS rather than sliced by hand: the grid used to render a
 * fixed slice(0,2) + slice(2,4), so adding a fifth card silently dropped the
 * last one off the dashboard.
 */
const NAV_ROWS: ((typeof NAV_CARDS)[number] | null)[][] = Array.from(
  { length: Math.ceil(NAV_CARDS.length / 2) },
  (_, row) => {
    const pair = NAV_CARDS.slice(row * 2, row * 2 + 2);
    return pair.length === 2 ? pair : [...pair, null];
  }
);

export default function Dashboard() {
  const { user } = useAuth();
  const profileName = user?.name ?? 'Medical Rep';

  return (
    <ScreenLayout
      userName={profileName}
      notificationCount={1}
      headerAction={
        <AppButton
          label="New Note"
          onPress={() => {}}
          icon={<Ionicons name="add" size={20} color={Colors.textOnDark} />}
          style={styles.hiddenHeaderButton}
        />
      }
    >
      <View style={styles.grid}>
        {NAV_ROWS.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((card, position) => (
              // Every slot is the SAME cell view, filled or empty, so each
              // column resolves to an identical width on every row. Letting the
              // card and an empty spacer flex on their own styles left the last
              // row slightly wider than the rows above it.
              <View
                key={card ? card.label : `spacer-${position}`}
                style={styles.cell}
              >
                {card ? (
                  <DashboardNavCard
                    label={card.label}
                    description={card.description}
                    iconName={card.iconName}
                    onPress={() => router.navigate(card.href)}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  hiddenHeaderButton: {
    display: 'none' as const,
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  // One column of one row. minWidth 0 stops a card's text forcing the cell
  // wider than its share, which is what pushed the last row out of alignment.
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
