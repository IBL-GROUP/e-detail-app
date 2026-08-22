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
import { AttachmentPicker } from './AttachmentPicker';
import { Colors } from '@/constants/theme';
import { PAKISTAN_CITIES } from '@/constants/pakistan-cities';
import {
  formatPakistaniMobile,
  isCompletePakistaniMobile,
  toNationalDigits,
  PHONE_MAX_LENGTH,
  PHONE_PLACEHOLDER,
} from '@/lib/phone';
import type { PatientLogInput, PatientListRow } from '@/api/patients';
import type { DoctorDataRow } from '@/api/doctor';

/**
 * How the product is given. Stored in patient_log.oral_pfs, which is varchar(10)
 * — these two values are what it holds, so they are offered as a choice rather
 * than as free text that could arrive spelled three different ways.
 */
const ORAL_PFS_OPTIONS = ['Oral', 'PFS'] as const;

/**
 * What the patient is being treated for. A pick-list rather than free text, so
 * the same condition is spelled one way across the whole log and can be counted
 * on later.
 *
 * The starting set — extend this array to add more; nothing else needs to change,
 * and patient_log.indication (varchar 100) has room to spare.
 */
const INDICATION_OPTIONS = [
  'Diabetes',
  'Weight loss',
  'Thyroid',
  'Anxiety',
  'Depression',
  'Insomnia',
];

/**
 * The varchar limits patient_log enforces, for the free-text fields — mirrored
 * so a field can't overrun what the column accepts.
 *
 * Contact number, city, speciality, indication and dose aren't here: they are
 * a formatted number and four pick-lists, so their length is bounded by the
 * values on offer rather than by what can be typed.
 */
const MAX_LENGTHS = {
  patient_name: 255,
  address: 500,
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
  /** SKU names assigned to this rep — the Dose dropdown's options. */
  skus: string[];
  /** The row being edited, or null when adding a new patient. */
  editing?: PatientListRow | null;
  submitting?: boolean;
  /** Set when the last submit failed, so the rep can read why and retry. */
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (patient: PatientLogInput) => void;
}

/** One labelled input. Pass `inRow` for fields sharing a horizontal row. */
function Field({
  label,
  required = false,
  inRow = false,
  children,
}: {
  label: string;
  required?: boolean;
  inRow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.field, inRow && styles.fieldInRow]}>
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
  skus,
  editing = null,
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
  const [address, setAddress] = useState('');
  const [oralPfs, setOralPfs] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [indication, setIndication] = useState('');
  const [dose, setDose] = useState('');
  const [strength1, setStrength1] = useState('');
  const [strength2, setStrength2] = useState('');
  const [strength3, setStrength3] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
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

  /**
   * The SKU list with the current dose folded in — a patient recorded against
   * a SKU the rep no longer carries must still show what they are on, rather
   * than rendering as an empty field when the row is opened for editing.
   */
  const skuOptions = useMemo(() => {
    const options = new Set(skus.filter(Boolean));
    if (dose) options.add(dose);
    return [...options].sort((left, right) => left.localeCompare(right));
  }, [skus, dose]);

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
    setAddress('');
    setOralPfs('');
    setDoctorName('');
    setSpeciality('');
    setIndication('');
    setDose('');
    setStrength1('');
    setStrength2('');
    setStrength3('');
    setAttachments([]);
    setShowErrors(false);
  };

  /**
   * Load the row being edited into the fields, and clear them again for a new
   * patient.
   *
   * Keyed on the row identity rather than on `visible`, so re-rendering while
   * the sheet is open never overwrites what the rep is part-way through typing.
   */
  const editingKey = editing
    ? String(editing.client_patient_id ?? editing.s_no)
    : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  if (visible && editingKey !== loadedKey) {
    setLoadedKey(editingKey);
    if (editing) {
      setPatientName(editing.patient_name ?? '');
      setContactNumber(formatPakistaniMobile(editing.contact_number ?? ''));
      setCity(editing.city ?? '');
      setAddress(editing.address ?? '');
      setOralPfs(editing.oral_pfs ?? '');
      setDoctorName(editing.doctor ?? '');
      setSpeciality(editing.speciality ?? '');
      setIndication(editing.indication ?? '');
      setDose(editing.dose ?? '');
      setStrength1(editing.strength_month_1 ?? '');
      setStrength2(editing.strength_month_2 ?? '');
      setStrength3(editing.strength_month_3 ?? '');
      setAttachments((editing.attachments ?? []).filter(Boolean));
      setShowErrors(false);
    } else {
      resetForm();
    }
  }

  const handleCancel = () => {
    resetForm();
    setLoadedKey(null);
    onCancel();
  };

  /**
   * Everything is required except Month 2 and Month 3 — a course can be a single
   * month, but the rest of the record is what makes it usable, and a prescription
   * with no photo cannot be verified later.
   *
   * Contact carries two distinct failures: not entered at all, and entered but
   * incomplete. They need different wording, so they stay separate.
   */
  const contactIncomplete =
    contactNumber.length > 0 && !isCompletePakistaniMobile(contactNumber);

  const missing = {
    patientName: patientName.trim().length === 0,
    address: address.trim().length === 0,
    city: city.trim().length === 0,
    contact: contactNumber.trim().length === 0,
    oralPfs: oralPfs.trim().length === 0,
    doctor: doctorName.trim().length === 0,
    speciality: speciality.trim().length === 0,
    indication: indication.trim().length === 0,
    dose: dose.trim().length === 0,
    strength1: strength1.trim().length === 0,
    attachments: attachments.length === 0,
  };

  const hasErrors =
    contactIncomplete || Object.values(missing).some(Boolean);

  /** The red line under a field, shown only after a submit attempt. */
  const hint = (show: boolean, message: string) =>
    showErrors && show ? <Text style={styles.errorHint}>{message}</Text> : null;

  /** Red border on a dropdown trigger, for the same reason. */
  const invalidTrigger = (show: boolean) =>
    showErrors && show ? styles.inputError : undefined;

  const handleSubmit = () => {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }

    const trimmed = (value: string) => {
      const text = value.trim();
      return text === '' ? undefined : text;
    };

    const doctorRow = doctorsByName.get(doctorName);

    onSubmit({
      // Identify the row being edited: client_patient_id is the upsert key,
      // and s_no covers rows filed before that column existed.
      ...(editing
        ? {
            s_no: editing.s_no,
            client_patient_id: editing.client_patient_id ?? undefined,
          }
        : {}),
      patient_name: patientName.trim(),
      contact_number: trimmed(contactNumber),
      city: trimmed(city),
      address: trimmed(address),
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
      attachments,
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
              <Text style={styles.title}>{editing ? 'Edit Patient' : 'Add Patient'}</Text>
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
                  style={[
                    styles.input,
                    showErrors && missing.patientName && styles.inputError,
                  ]}
                  maxLength={MAX_LENGTHS.patient_name}
                />
                {hint(missing.patientName, 'Patient name is required.')}
              </Field>

              <Field label="Address" required>
                {/* Full width and multiline — a street address doesn't fit the
                    single-line half-width boxes the other fields use. */}
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House / street / area"
                  placeholderTextColor={Colors.textMuted}
                  style={[
                    styles.input,
                    styles.inputMultiline,
                    showErrors && missing.address && styles.inputError,
                  ]}
                  maxLength={MAX_LENGTHS.address}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
                {hint(missing.address, 'Address is required.')}
              </Field>

              {/* City then contact: the address block reads top-down from where
                  the patient is to how to reach them. */}
              <View style={styles.row}>
                <Field label="City" inRow required>
                  <AppBottomSheetSelect
                    options={PAKISTAN_CITIES}
                    value={city}
                    onChange={setCity}
                    placeholder="Select city"
                    title="Select City"
                    searchPlaceholder="Search cities"
                    emptyText="No city matches that search."
                    triggerStyle={invalidTrigger(missing.city)}
                  />
                  {hint(missing.city, 'City is required.')}
                </Field>
                <Field label="Contact Number" inRow required>
                  <TextInput
                    value={contactNumber}
                    onChangeText={handleContactChange}
                    placeholder={PHONE_PLACEHOLDER}
                    placeholderTextColor={Colors.textMuted}
                    style={[
                      styles.input,
                      showErrors &&
                        (missing.contact || contactIncomplete) &&
                        styles.inputError,
                    ]}
                    keyboardType="phone-pad"
                    maxLength={PHONE_MAX_LENGTH}
                  />
                  {hint(missing.contact, 'Contact number is required.')}
                  {/* Entered but half-typed — a different mistake, worded so. */}
                  {hint(!missing.contact && contactIncomplete, 'Enter the full number.')}
                </Field>
              </View>

              <Field label="Oral / PFS" required>
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
                {hint(missing.oralPfs, 'Choose Oral or PFS.')}
              </Field>

              <Field label="Doctor" required>
                <AppBottomSheetSelect
                  options={doctorOptions}
                  value={doctorName}
                  onChange={handleDoctorChange}
                  placeholder="Select a doctor"
                  title="Select Doctor"
                  searchPlaceholder="Search doctors"
                  emptyText="No doctors are assigned to you yet."
                  triggerStyle={invalidTrigger(missing.doctor)}
                />
                {hint(missing.doctor, 'Doctor is required.')}
              </Field>

              <Field label="Speciality" required>
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
                  triggerStyle={invalidTrigger(missing.speciality)}
                />
                {hint(missing.speciality, 'Speciality is required.')}
              </Field>

              <View style={styles.row}>
                <Field label="Indication" inRow required>
                  {/* Six options — the sheet's search would be noise, so it's off. */}
                  <AppBottomSheetSelect
                    options={INDICATION_OPTIONS}
                    value={indication}
                    onChange={setIndication}
                    placeholder="Select indication"
                    title="Select Indication"
                    searchable={false}
                    emptyText="No indications available."
                    triggerStyle={invalidTrigger(missing.indication)}
                  />
                  {hint(missing.indication, 'Indication is required.')}
                </Field>
                <Field label="Dose" inRow required>
                  {/* The SKUs this rep carries — the dose IS the product they
                      put the patient on, so it is picked from their own book
                      rather than typed. */}
                  <AppBottomSheetSelect
                    options={skuOptions}
                    value={dose}
                    onChange={setDose}
                    placeholder="Select dose"
                    title="Select Dose"
                    searchPlaceholder="Search SKUs"
                    emptyText="No SKUs are assigned to you yet."
                    triggerStyle={invalidTrigger(missing.dose)}
                  />
                  {hint(missing.dose, 'Dose is required.')}
                </Field>
              </View>

              {/* Grouped, so "Strength" sits the same 6px above its inputs that
                  every other label does — as a bare sibling it took the 14px
                  gap instead and read as detached from the months below it. */}
              <View style={styles.group}>
                <Text style={styles.sectionLabel}>Strength</Text>
                <View style={styles.row}>
                {/* Month 1 is the course; months 2 and 3 are its continuation,
                    and a one-month course is legitimate. Only the first is
                    required. */}
                <Field label="Month 1" inRow required>
                  <TextInput
                    value={strength1}
                    onChangeText={setStrength1}
                    placeholder="—"
                    placeholderTextColor={Colors.textMuted}
                    style={[
                      styles.input,
                      showErrors && missing.strength1 && styles.inputError,
                    ]}
                    maxLength={MAX_LENGTHS.strength}
                  />
                  {hint(missing.strength1, 'Required.')}
                </Field>
                <Field label="Month 2" inRow>
                  <TextInput
                    value={strength2}
                    onChangeText={setStrength2}
                    placeholder="—"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                    maxLength={MAX_LENGTHS.strength}
                  />
                </Field>
                <Field label="Month 3" inRow>
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
              </View>

              <Field label="Prescription" required>
                <AttachmentPicker
                  value={attachments}
                  onChange={setAttachments}
                  invalid={showErrors && missing.attachments}
                />
                {hint(missing.attachments, 'A prescription photo is required.')}
              </Field>

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
                label={submitting ? 'Saving…' : editing ? 'Save Changes' : 'Save Patient'}
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
  /**
   * A field is content-height by design. It must NOT flex here: these are
   * mostly direct children of the vertical scroll container, where `flex: 1`
   * applies to the VERTICAL axis and every field starts claiming an equal share
   * of the height — which is what made the gaps between them uneven.
   */
  field: {
    gap: 6,
  },
  // Only inside a horizontal `row`, where flexing is what splits the width.
  fieldInRow: {
    flex: 1,
    minWidth: 0,
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
  // A label plus the inputs it heads, on the same 6px rhythm as a Field.
  group: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
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
  inputMultiline: {
    minHeight: 64,
    paddingTop: 10,
    paddingBottom: 10,
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
