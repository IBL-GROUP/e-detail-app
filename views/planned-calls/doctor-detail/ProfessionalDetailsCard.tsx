import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

interface DetailFieldProps {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

function DetailField({ iconName, label, value }: DetailFieldProps) {
  return (
    <View style={styles.field}>
      {/* Filled tile, white glyph — reads as one solid marker per fact rather
          than six loose outlines. */}
      <View style={styles.iconTile}>
        <Ionicons name={iconName} size={16} color={Colors.textOnDark} />
      </View>

      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

interface ProfessionalDetailsCardProps {
  hospital: string;
  address: string;
  city: string;
  lastVisit: string;
  doctorClass: string;
  pmdcNumber: string;
}

export function ProfessionalDetailsCard({
  hospital,
  address,
  city,
  lastVisit,
  doctorClass,
  pmdcNumber,
}: ProfessionalDetailsCardProps) {
  return (
    <View style={styles.card}>
      {/* Heading hidden — every field carries its own label, so "Professional
          Details" only added a line above facts that already name themselves.
          The style is kept for when it comes back. */}
      <View style={styles.grid}>
        {/* HOSPITAL and ADDRESS are TEMPORARILY hidden — no source column feeds
            them yet, so both always rendered a dash. The props are kept so they
            come back by uncommenting these two lines.
        <DetailField iconName="business-outline" label="HOSPITAL" value={hospital} />
        <DetailField iconName="location-outline" label="ADDRESS" value={address} />
        */}
        <DetailField iconName="map-outline" label="CITY" value={city} />
        <DetailField iconName="time-outline" label="LAST VISIT" value={lastVisit} />
        <DetailField iconName="ribbon-outline" label="DOCTOR CLASS" value={doctorClass} />
        <DetailField iconName="card-outline" label="PMDC NUMBER" value={pmdcNumber} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    columnGap: 16,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 200,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  fieldText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
});
