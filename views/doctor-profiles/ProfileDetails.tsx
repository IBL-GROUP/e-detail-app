import { useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CompanyShare, DoctorProfileRow, PracticeSite } from '@/api/doctorProfiles';
import { Colors } from '@/constants/theme';
import { ImageViewerModal } from '@/views/patients/ImageViewerModal';
import { DetailRow } from './formParts';
import { filledShares, formatAvgTime, formatDoctorName, sitesOf } from './profileRules';

type Section = { key: string; label: string; render: () => ReactNode };

/**
 * A captured profile, read-only — the Searle app's Doctor Details screen: a
 * hero card with the doctor's name and PMDC, a segmented control
 * (Profile · Specialty · Insights · Locations), and the chosen section's rows
 * in a card. In this app's colours. Locations lists every practice location
 * (DINFO-FR-012), where Searle had one tab per clinic.
 */
export function ProfileDetails({ profile }: { profile: DoctorProfileRow }) {
  const [activeKey, setActiveKey] = useState('profile');
  const [viewerOpen, setViewerOpen] = useState(false);
  const card = String(profile.visitingCardUrl ?? '').trim();
  // DINFO-FR-012: older and Searle profiles read as Locations 1 and 2.
  const sites = useMemo(() => sitesOf(profile), [profile]);

  const sections = useMemo<Section[]>(() => {
    const clinicRows = (site: PracticeSite) => {
      return (
        <>
          <DetailRow label="Speciality" value={site.speciality} />
          <DetailRow label="Hospital" value={site.hospital} />
          <DetailRow label="City" value={site.city} />
          <DetailRow label="Session" value={site.session} />
          <DetailRow label="Fee / Patient" value={site.fee} />
          <DetailRow label="Avg Time" value={formatAvgTime(site.avgTime)} />
          <DetailRow label="Patients / Day" value={site.patientsPerDay} />
          <DetailRow label="OPD Timing" value={site.opdTiming} />
          <DetailRow label="Best Visiting Time" value={site.bestVisitingTime} />
          <DetailRow label="Appointment" value={site.appointmentSystem} />
        </>
      );
    };

    const list: Section[] = [
      {
        key: 'profile',
        label: 'Profile',
        render: () => (
          <>
            <DetailRow label="Father's Name" value={profile.fatherName} />
            <DetailRow label="Issue Date" value={profile.issueDate} />
            <DetailRow label="Religion" value={profile.religion} />
            <DetailRow label="Age" value={profile.age} />
            <DetailRow label="Gender" value={profile.gender} />
            <DetailRow label="Cell No" value={profile.cellNo} />
            <DetailRow label="WhatsApp" value={profile.whatsappNo} />
            <DetailRow label="Digital Comfort" value={profile.digitalComfortLevel} />
            <DetailRow label="Captured by" value={profile.createdBy} />
            <View style={styles.cardBlock}>
              <Text style={styles.cardLabel}>Visiting Card</Text>
              {card ? (
                <Pressable
                  onPress={() => setViewerOpen(true)}
                  style={({ pressed }) => [styles.cardImageWrap, pressed && styles.pressed]}
                >
                  <Image source={{ uri: card }} style={styles.cardImage} resizeMode="cover" />
                </Pressable>
              ) : (
                <Text style={styles.cardMissing}>—</Text>
              )}
            </View>
          </>
        ),
      },
      {
        key: 'specialty',
        label: 'Specialty',
        render: () => (
          <>
            {sites.map((site, index) => (
              <DetailRow
                key={index}
                label={sites.length > 1 ? `Speciality · Location ${index + 1}` : 'Speciality'}
                value={site.speciality}
              />
            ))}
            <DetailRow label="Practice Locations" value={profile.practiceLocations} />
            <DetailRow label="Practice Type" value={profile.practiceType} />
          </>
        ),
      },
      {
        key: 'insights',
        label: 'Insights',
        render: () => (
          <>
            <DetailRow label="Innovation & Medicine Adoption" value={profile.innovationAdoption} />
            <DetailRow label="Access Type" value={profile.accessType} />
            <DetailRow label="Interaction Style" value={profile.preferredInteractionStyle} />
            <DetailRow label="TSCL Prescriber" value={profile.rxStatus} />
            <DetailRow label="Rx Patterns" value={profile.rxPatterns} />
            <DetailRow label="Pharmacy Ownership" value={profile.pharmacyOwnership} />
            <DetailRow
              label="Other Company Prescriber"
              value={filledShares((profile.otherCompanyPrescribers ?? []) as CompanyShare[])
                .map((share) => `${share.company} – ${share.percent}%`)
                .join('; ')}
            />
          </>
        ),
      },
      {
        key: 'locations',
        label: 'Locations',
        render: () =>
          sites.map((site, index) => (
            <View key={index} style={index > 0 ? styles.locationBlockSpaced : undefined}>
              <Text style={styles.locationTitle}>Location {index + 1}</Text>
              {clinicRows(site)}
            </View>
          )),
      },
    ];
    return list;
  }, [profile, sites, card]);

  const active = sections.find((section) => section.key === activeKey) ?? sections[0];

  return (
    <View style={styles.wrap}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Doctor Profile</Text>
        <Text style={styles.heroName}>{formatDoctorName(profile.doctorName) || '—'}</Text>
        <View style={styles.chipRow}>
          {profile.pmdcNumber ? (
            <View style={styles.chip}>
              <Ionicons name="card-outline" size={12} color={Colors.textOnDark} />
              <Text style={styles.chipText}>PMDC {String(profile.pmdcNumber)}</Text>
            </View>
          ) : null}
          {profile.pmdcStatus ? (
            <View style={styles.chipOutline}>
              <Text style={styles.chipOutlineText}>{String(profile.pmdcStatus)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Segmented control */}
      <View style={styles.segments}>
        {sections.map((section) => {
          const selected = section.key === active.key;
          return (
            <Pressable
              key={section.key}
              onPress={() => setActiveKey(section.key)}
              style={[styles.segment, selected && styles.segmentActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]} numberOfLines={1}>
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The chosen section */}
      <View style={styles.card}>{active.render()}</View>

      {card ? (
        <ImageViewerModal
          images={[card]}
          startIndex={viewerOpen ? 0 : null}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  // This app's navy, where Searle's hero uses its own.
  hero: {
    borderRadius: 14,
    backgroundColor: Colors.secondary,
    padding: 16,
    gap: 6,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroName: {
    color: Colors.textOnDark,
    fontSize: 22,
    fontWeight: '800',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  chipText: {
    color: Colors.textOnDark,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  chipOutline: {
    height: 24,
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 8,
  },
  chipOutlineText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  segments: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  segmentActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  segmentTextActive: {
    color: Colors.textOnDark,
  },
  card: {
    borderRadius: 14,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardBlock: {
    gap: 8,
    paddingVertical: 10,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardMissing: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 1.75,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  pressed: {
    opacity: 0.75,
  },
  locationTitle: {
    paddingTop: 10,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  locationBlockSpaced: {
    marginTop: 8,
  },
});
