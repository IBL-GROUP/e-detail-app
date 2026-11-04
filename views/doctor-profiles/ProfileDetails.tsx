import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CompanyShare, DoctorProfileRow } from '@/api/doctorProfiles';
import { Colors } from '@/constants/theme';
import { ImageViewerModal } from '@/views/patients/ImageViewerModal';
import { SectionCard } from './formParts';
import { filledShares, formatDoctorName, hasSecondaryPractice } from './profileRules';

/** Anything a profile field can hold, shown as text; blank as a dash. */
function show(value: unknown) {
  const text = String(value ?? '').trim();
  return text || '—';
}

/** One label / value line. */
function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{show(value)}</Text>
    </View>
  );
}

/** The nine practice fields for one location. */
function PracticeRows({ profile, side }: { profile: DoctorProfileRow; side: 'primary' | 'secondary' }) {
  const field = (name: string) => (profile as Record<string, unknown>)[`${side}${name}`];
  const minutes = String(field('AvgTime') ?? '').trim();
  return (
    <>
      <Row label="Speciality" value={field('Speciality')} />
      <Row label="City" value={field('City')} />
      <Row label="Hospital" value={field('Hospital')} />
      <Row label="Session" value={field('Session')} />
      <Row label="Fee / Patient" value={field('Fee')} />
      <Row label="Avg Time / Patient" value={minutes ? `${minutes} min` : ''} />
      <Row label="Patients / Day" value={field('PatientsPerDay')} />
      <Row label="OPD Timing" value={field('OpdTiming')} />
      <Row label="Best Visiting Time" value={field('BestVisitingTime')} />
      <Row label="Appointment System" value={field('AppointmentSystem')} />
    </>
  );
}

/**
 * A doctor profile laid out read-only, section by section — the captured view
 * and the form's Review step both use it, so what a rep confirms before saving
 * is exactly what they will see afterwards.
 */
export function ProfileDetails({ profile }: { profile: DoctorProfileRow }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const card = String(profile.visitingCardUrl ?? '').trim();
  const shares = filledShares((profile.otherCompanyPrescribers ?? []) as CompanyShare[]);
  const secondary = hasSecondaryPractice(String(profile.practiceLocations ?? ''));

  return (
    <View style={styles.wrap}>
      <SectionCard title="PMDC Registration" icon="shield-checkmark-outline">
        <Row label="Doctor Name" value={formatDoctorName(profile.doctorName)} />
        <Row label="PMDC Number" value={profile.pmdcNumber} />
        <Row label="PMDC Status" value={profile.pmdcStatus} />
        <Row label="Father's Name" value={profile.fatherName} />
        <Row label="Issue Date" value={profile.issueDate} />
        <View style={styles.cardBlock}>
          <Text style={styles.label}>Visiting Card</Text>
          {card ? (
            <Pressable
              onPress={() => setViewerOpen(true)}
              style={({ pressed }) => [styles.cardImageWrap, pressed && styles.pressed]}
            >
              <Image source={{ uri: card }} style={styles.cardImage} resizeMode="cover" />
            </Pressable>
          ) : (
            <Text style={styles.value}>—</Text>
          )}
        </View>
      </SectionCard>

      <SectionCard title="Personal Information" icon="person-outline">
        <Row label="Religion" value={profile.religion} />
        <Row label="Age" value={profile.age} />
        <Row label="Gender" value={profile.gender} />
        <Row label="Cell No" value={profile.cellNo} />
        <Row label="WhatsApp No" value={profile.whatsappNo} />
        <Row label="Digital Comfort Level" value={profile.digitalComfortLevel} />
      </SectionCard>

      <SectionCard title="Professional Information" icon="briefcase-outline">
        <Row label="Practice Locations" value={profile.practiceLocations} />
        <Row label="Practice Type" value={profile.practiceType} />
      </SectionCard>

      <SectionCard title={secondary ? 'Primary Practice' : 'Practice Location'} icon="business-outline">
        <PracticeRows profile={profile} side="primary" />
      </SectionCard>

      {secondary ? (
        <SectionCard title="Secondary Practice" icon="business-outline">
          <PracticeRows profile={profile} side="secondary" />
        </SectionCard>
      ) : null}

      <SectionCard title="Commercial & Accessibility" icon="trending-up-outline">
        <Row label="Innovation & Medicine Adoption" value={profile.innovationAdoption} />
        <Row label="Access Type" value={profile.accessType} />
        <Row label="Preferred Interaction Style" value={profile.preferredInteractionStyle} />
        <Row label="TSCL Prescriber" value={profile.rxStatus} />
        <Row label="Rx Patterns" value={profile.rxPatterns} />
        <Row label="Pharmacy Ownership" value={profile.pharmacyOwnership} />
        <Row
          label="Other Company Prescriber"
          value={shares.map((share) => `${share.company} ${share.percent}%`).join(', ')}
        />
      </SectionCard>

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
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    flexShrink: 0,
    maxWidth: '48%',
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  cardBlock: {
    gap: 8,
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
