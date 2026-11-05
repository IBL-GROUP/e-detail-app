import { useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CompanyShare, DoctorProfileRow } from '@/api/doctorProfiles';
import { Colors } from '@/constants/theme';
import { ImageViewerModal } from '@/views/patients/ImageViewerModal';
import { DetailRow } from './formParts';
import { filledShares, formatDoctorName, hasSecondaryPractice } from './profileRules';

type Section = { key: string; label: string; render: () => ReactNode };

/**
 * A captured profile, read-only — the Searle app's Doctor Details screen: a
 * hero card with the doctor's name and PMDC, a segmented control
 * (Profile · Specialty · Insights · Clinic 1 · Clinic 2), and the chosen
 * section's rows in a card. In this app's colours.
 */
export function ProfileDetails({ profile }: { profile: DoctorProfileRow }) {
  const [activeKey, setActiveKey] = useState('profile');
  const [viewerOpen, setViewerOpen] = useState(false);
  const card = String(profile.visitingCardUrl ?? '').trim();
  const secondary = hasSecondaryPractice(String(profile.practiceLocations ?? ''));

  const sections = useMemo<Section[]>(() => {
    const field = (name: string) => (profile as Record<string, unknown>)[name];
    const clinicRows = (side: 'primary' | 'secondary') => {
      const value = (name: string) => field(`${side}${name}`);
      const minutes = String(value('AvgTime') ?? '').trim();
      return (
        <>
          <DetailRow label="Hospital" value={value('Hospital')} />
          <DetailRow label="City" value={value('City')} />
          <DetailRow label="Session" value={value('Session')} />
          <DetailRow label="Fee / Patient" value={value('Fee')} />
          <DetailRow label="Avg Time" value={minutes ? `${minutes} min` : ''} />
          <DetailRow label="Patients / Day" value={value('PatientsPerDay')} />
          <DetailRow label="OPD Timing" value={value('OpdTiming')} />
          <DetailRow label="Best Visiting Time" value={value('BestVisitingTime')} />
          <DetailRow label="Appointment" value={value('AppointmentSystem')} />
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
            <DetailRow label="Primary Speciality" value={profile.primarySpeciality} />
            {String(profile.secondarySpeciality ?? '').trim() ? (
              <DetailRow label="Secondary Speciality" value={profile.secondarySpeciality} />
            ) : null}
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
      { key: 'primary', label: secondary ? 'Clinic 1' : 'Clinic', render: () => clinicRows('primary') },
    ];
    if (secondary) {
      list.push({ key: 'secondary', label: 'Clinic 2', render: () => clinicRows('secondary') });
    }
    return list;
  }, [profile, secondary, card]);

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
});
