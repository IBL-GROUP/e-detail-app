import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppBottomSheetSelect } from '@/components/ui/AppBottomSheetSelect';
import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/theme';
import { PAKISTAN_CITIES } from '@/constants/pakistan-cities';
import {
  formatPakistaniMobile,
  isCompletePakistaniMobile,
  toNationalDigits,
  PHONE_MAX_LENGTH,
  PHONE_PLACEHOLDER,
} from '@/lib/phone';
import type { PatientLogInput } from '@/api/patients';
import type { DoctorDataRow } from '@/api/doctor';

/**
 * How the product is given. Stored in patient_log.oral_pfs, which is varchar(10)
 * — these two values are what it holds, so they are offered as a choice rather
 * than as free text that could arrive spelled three different ways.
 */
const ORAL_PFS_OPTIONS = ['Oral', 'PFS'] as const;

/**
 * The varchar limits patient_log enforces, for the free-text fields — mirrored
 * so a field can't overrun what the column accepts.
 *
 * Contact number, city and speciality aren't here: they are a formatted number
 * and two pick-lists, so their length is bounded by the values on offer rather
 * than by what can be typed.
 */
const MAX_LENGTHS = {
  patient_name: 255,
  indication: 100,
  dose: 100,
  strength: 50,
} as const;

interface AddPatientModalProps {
  visible: boolean;
  /** The rep's own doctors — picking one fills the doctor id and specialty. */
  doctors: DoctorDataRow[];
  /**
   * Specialty names for the dropdown. Picking a doctor selects theirs; this is
   * the list the rep can override it from.
   */
  specialties: string[];
  submitting?: boolean;
  /** Set when the last submit failed, so the rep can read why and retry. */
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (patient: PatientLogInput) => void;
}

/** One labelled input row. */
function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function AddPatientModal({
  visible,
  doctors,
  specialties,
  submitting = false,
  errorMessage,
  onCancel,
  onSubmit,
}: AddPatientModalProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [patientName, setPatientName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [city, setCity] = useState('');
  const [oralPfs, setOralPfs] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [indication, setIndication] = useState('');
  const [dose, setDose] = useState('');
  const [strength1, setStrength1] = useState('');
  const [strength2, setStrength2] = useState('');
  const [strength3, setStrength3] = useState('');
  // Only shown after a submit attempt, so the form doesn't scold before it is used.
  const [showErrors, setShowErrors] = useState(false);

  // Name -> row, so picking a doctor can carry their id and specialty across.
  // Keyed by name because the picker deals in labels; a repeated name collapses
  // to the first, which is the same doctor as far as the log is concerned.
  const doctorsByName = useMemo(() => {
    const map = new Map<string, DoctorDataRow>();
    for (const row of doctors) {
      const name = String(row.DOCTORNAME ?? '').trim();
      if (name && !map.has(name)) map.set(name, row);
    }
    return map;
  }, [doctors]);

  const doctorOptions = useMemo(() => [...doctorsByName.keys()], [doctorsByName]);

  /**
   * The specialty list, with the currently selected one folded in.
   *
   * A doctor's specialty is whatever `doctor_tso_specialty_mapping` holds for
   * this rep, and the master list can name it slightly differently ('Orthopaedic'
   * vs 'Orthopaedics' — the drift routes.doctor-team-mapping.js documents).
   * Without this, auto-filling could select a value the dropdown doesn't contain
   * and the field would look empty.
   */
  const specialtyOptions = useMemo(() => {
    const options = new Set(specialties.filter(Boolean));
    if (speciality) options.add(speciality);
    return [...options].sort((left, right) => left.localeCompare(right));
  }, [specialties, speciality]);

  const handleDoctorChange = (name: string) => {
    setDoctorName(name);
    // The specialty follows the doctor — it is the one the rep is mapped to them
    // under. Still editable below, but it should never have to be typed.
    const row = doctorsByName.get(name);
    const picked = row?.SpecialtyByCommercial ?? row?.SpecialtyByIkon ?? '';
    if (picked) setSpeciality(String(picked));
  };

  /**
   * Keep the field in +92-333-3029554 shape as it is typed.
   *
   * Re-formatting alone can't delete a separator: backspacing the '-' out of
   * "+92-333-3" leaves the digits unchanged, so the field would rebuild the
   * identical string and the key would look dead. When a deletion doesn't change
   * the digits, drop the last digit instead.
   */
  const handleContactChange = (next: string) => {
    const isDeletion = next.length < contactNumber.length;
    const nextDigits = toNationalDigits(next);
    const currentDigits = toNationalDigits(contactNumber);
    const digits =
      isDeletion && nextDigits === currentDigits
        ? nextDigits.slice(0, -1)
        : nextDigits;

    setContactNumber(formatPakistaniMobile(digits));
  };

  const resetForm = () => {
    setPatientName('');
    setContactNumber('');
    setCity('');
    setOralPfs('');
    setDoctorName('');
    setSpeciality('');
    setIndication('');
    setDose('');
    setStrength1('');
    setStrength2('');
    setStrength3('');
    setShowErrors(false);
  };

  const handleCancel = () => {
    resetForm();
    onCancel();
  };

  const nameMissing = patientName.trim().length === 0;
  // The number is optional, but a HALF-typed one is a mistake, not a choice —
  // it would be filed as an unusable contact. Complete it or clear it.
  const contactIncomplete =
    contactNumber.length > 0 && !isCompletePakistaniMobile(contactNumber);

  const handleSubmit = () => {
    if (nameMissing || contactIncomplete) {
      setShowErrors(true);
      return;
    }

    const trimmed = (value: string) => {
      const text = value.trim();
      return text === '' ? undefined : text;
    };

    const doctorRow = doctorsByName.get(doctorName);

    onSubmit({
      patient_name: patientName.trim(),
      contact_number: trimmed(contactNumber),
      city: trimmed(city),
      oral_pfs: trimmed(oralPfs),
      strength_month_1: trimmed(strength1),
      strength_month_2: trimmed(strength2),
      strength_month_3: trimmed(strength3),
      indication: trimmed(indication),
      dose: trimmed(dose),
      doctor_id:
        doctorRow?.DOCTORID != null ? String(doctorRow.DOCTORID) : undefined,
      doctor: trimmed(doctorName),
      speciality: trimmed(speciality),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
      // The form is emptied once the sheet is fully gone, so a saved patient
      // doesn't flash back into the fields on the way out — and so reopening
      // always starts blank rather than on the previous patient.
      onDismiss={resetForm}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View
          style={[
            styles.backdrop,
            {
              paddingTop: Math.max(insets.top, 22),
              paddingBottom: Math.max(insets.bottom, 22),
            },
          ]}
        >
          <View style={[styles.sheet, { maxHeight: height * 0.86 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Add Patient</Text>
              <Pressable onPress={handleCancel} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.textOnDark} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Field label="Patient Name" required>
                <TextInput
                  value={patientName}
                  onChangeText={setPatientName}
                  placeholder="Full name"
                  placeholderTextColor={Colors.textMuted}
                  style={[styles.input, showErrors && nameMissing && styles.inputError]}
                  maxLength={MAX_LENGTHS.patient_name}
                />
                {showErrors && nameMissing ? (
                  <Text style={styles.errorHint}>Patient name is required.</Text>
                ) : null}
              </Field>

              <View style={styles.row}>
                <Field label="Contact Number">
                  <TextInput
                    value={contactNumber}
                    onChangeText={handleContactChange}
                    placeholder={PHONE_PLACEHOLDER}
                    placeholderTextColor={Colors.textMuted}
                    style={[
                      styles.input,
                      showErrors && contactIncomplete && styles.inputError,
                    ]}
                    keyboardType="phone-pad"
                    maxLength={PHONE_MAX_LENGTH}
                  />
                  {showErrors && contactIncomplete ? (
                    <Text style={styles.errorHint}>
                      Enter the full number, or clear it.
                    </Text>
                  ) : null}
                </Field>
                <Field label="City">
                  <AppBottomSheetSelect
                    options={PAKISTAN_CITIES}
                    value={city}
                    onChange={setCity}
                    placeholder="Select city"
                    title="Select City"
                    searchPlaceholder="Search cities"
                    emptyText="No city matches that search."
                  />
                </Field>
              </View>

              <Field label="Oral / PFS">
                <View style={styles.chipRow}>
                  {ORAL_PFS_OPTIONS.map((option) => {
                    const active = oralPfs === option;
                    return (
                      <Pressable
                        key={option}
                        // Tapping the active chip clears it — the column is
                        // nullable, so "neither" has to stay reachable.
                        onPress={() => setOralPfs(active ? '' : option)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Doctor">
                <AppBottomSheetSelect
                  options={doctorOptions}
                  value={doctorName}
                  onChange={handleDoctorChange}
                  placeholder="Select a doctor"
                  title="Select Doctor"
                  searchPlaceholder="Search doctors"
                  emptyText="No doctors are assigned to you yet."
                />
              </Field>

              <Field label="Speciality">
                {/* Auto-filled from the doctor above, and still changeable —
                    from the list, never typed, so it always matches a real
                    specialty name. */}
                <AppBottomSheetSelect
                  options={specialtyOptions}
                  value={speciality}
                  onChange={setSpeciality}
                  placeholder="Select a doctor to fill this"
                  title="Select Speciality"
                  searchPlaceholder="Search specialities"
                  emptyText="No specialities available."
                />
              </Field>

              <View style={styles.row}>
                <Field label="Indication">
                  <TextInput
                    value={indication}
                    onChangeText={setIndication}
                    placeholder="Indication"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.indication}
                  />
                </Field>
                <Field label="Dose">
                  <TextInput
                    value={dose}
                    onChangeText={setDose}
                    placeholder="Dose"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.dose}
                  />
                </Field>
              </View>

              <Text style={styles.sectionLabel}>Strength</Text>
              <View style={styles.row}>
                <Field label="Month 1">
                  <TextInput
                    value={strength1}
                    onChangeText={setStrength1}
                    placeholder="—"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.strength}
                  />
                </Field>
                <Field label="Month 2">
                  <TextInput
                    value={strength2}
                    onChangeText={setStrength2}
                    placeholder="—"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.strength}
                  />
                </Field>
                <Field label="Month 3">
                  <TextInput
                    value={strength3}
                    onChangeText={setStrength3}
                    placeholder="—"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.strength}
                  />
                </Field>
              </View>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <AppButton
                label="Cancel"
                variant="secondary"
                onPress={handleCancel}
                style={styles.footerButton}
              />
              <AppButton
                label={submitting ? 'Saving…' : 'Save Patient'}
                onPress={submitting ? undefined : handleSubmit}
                style={[styles.footerButton, submitting && styles.footerButtonDisabled]}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.textOnDark,
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  // Every field flexes, so a row of two or three shares its width evenly.
  field: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#44536A',
  },
  requiredMark: {
    color: Colors.danger,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorHint: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5B6A7F',
  },
  chipTextActive: {
    color: Colors.textOnDark,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: Colors.dangerBg,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerButton: {
    flex: 1,
  },
  footerButtonDisabled: {
    backgroundColor: Colors.disabledBg,
  },
});
