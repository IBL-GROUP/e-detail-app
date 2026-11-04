import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/theme';
import { readJson, removeRaw, writeJson } from '@/lib/offline/fileStore';
import {
  lookupPmdc,
  useDoctorProfileMaster,
  useSaveDoctorProfile,
  type AssignedDoctor,
  type CompanyShare,
  type DoctorProfileFields,
} from '@/api/doctorProfiles';
import { CompanySharesField } from './CompanySharesField';
import {
  ChoiceChips,
  Field,
  FieldRow,
  HospitalField,
  ReadOnlyValue,
  SectionCard,
  SelectField,
  TextField,
} from './formParts';
import { ProfileDetails } from './ProfileDetails';
import { VisitingCardPicker } from './VisitingCardPicker';
import {
  ACCESS_TYPES,
  ADOPTION_LEVELS,
  APPOINTMENT_SYSTEMS,
  BEST_VISITING_TIMES,
  DIGITAL_COMFORT_LEVELS,
  DOCTOR_SPECIALITIES,
  EMPTY_PROFILE,
  FALLBACK_CITIES,
  FIELD_HELP,
  GENDERS,
  INTERACTION_STYLES,
  OPD_TIMINGS,
  PHARMACY_OWNERSHIP,
  PRACTICE_LOCATIONS,
  PRACTICE_TYPES,
  RELIGIONS,
  RX_PATTERNS,
  RX_STATUSES,
  SECONDARY_FIELDS,
  SESSION_TIMES,
  STEPS,
  STEP_FIELDS,
  filledShares,
  formatDoctorName,
  formatPkMobile,
  hasSecondaryPractice,
  normalizePmdcStatus,
  validateProfile,
} from './profileRules';

/** An in-progress form kept on the device until it is saved. */
interface Draft {
  form: DoctorProfileFields;
  step: number;
  whatsappManual: boolean;
}

const draftKey = (userId: string, pmdc: string) =>
  `doctor-profile-draft-${userId}-${pmdc.trim().toUpperCase()}`;

/** Digits only, for the numeric boxes. */
const numeric = (value: string, max: number) => value.replace(/[^0-9]/g, '').slice(0, max);

interface ProfileFormProps {
  /** The assigned doctor being profiled — PMDC and identity come from it. */
  doctor: AssignedDoctor;
  userId: string;
  mieId?: string;
  /** Back to the assigned list without saving (the draft is kept). */
  onExit: () => void;
  /** Called once the profile is safely in the device queue. */
  onSaved: () => void;
}

/**
 * Capture one doctor's profile: the Searle app's six steps, rebuilt with this
 * app's components.
 *
 * Offline-first like everything a rep records here. The in-progress form is
 * saved on the device as a draft (so a killed app loses nothing), and Save
 * writes to the profile queue, which uploads the visiting card and the profile
 * on the next flush. Only the PMDC lookup needs signal, and only when the
 * assigned list didn't already carry the doctor's identity.
 */
export function ProfileForm({ doctor, userId, mieId, onExit, onSaved }: ProfileFormProps) {
  const pmdc = doctor.pmdcNumber.trim().toUpperCase();
  const identityFromList: Partial<DoctorProfileFields> = {
    pmdcNumber: pmdc,
    pmdcStatus: normalizePmdcStatus(doctor.pmdcStatus),
    doctorName: formatDoctorName(doctor.doctorName),
    fatherName: String(doctor.fatherName ?? '').trim(),
    issueDate: String(doctor.issueDate ?? '').trim(),
  };

  const [form, setForm] = useState<DoctorProfileFields>({ ...EMPTY_PROFILE, ...identityFromList });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pmdcMessage, setPmdcMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Until the rep changes WhatsApp by hand, it follows the cell number.
  const whatsappManual = useRef(false);
  const scrollRef = useRef<any>(null);
  // Set synchronously on the first tap of Save — see the patient screen.
  const submittingRef = useRef(false);

  const masterQuery = useDoctorProfileMaster();
  const save = useSaveDoctorProfile(userId, mieId);

  const current = STEPS[step];
  const showSecondary = hasSecondaryPractice(form.practiceLocations);

  // ---- master lists -------------------------------------------------------

  const cities = useMemo(() => {
    const names = (masterQuery.data?.cities ?? []).map((city) => city.name).filter(Boolean);
    return names.length ? names : FALLBACK_CITIES;
  }, [masterQuery.data?.cities]);

  const hospitalsFor = (cityName: string) => {
    const city = (masterQuery.data?.cities ?? []).find(
      (entry) => entry.name.toLowerCase() === cityName.toLowerCase(),
    );
    if (!city) return [];
    return (masterQuery.data?.hospitals ?? [])
      .filter((hospital) => hospital.cityId === city.id)
      .map((hospital) => hospital.name);
  };

  const companies = useMemo(
    () => (masterQuery.data?.pharma ?? []).map((entry) => entry.name).filter(Boolean),
    [masterQuery.data?.pharma],
  );

  // ---- draft --------------------------------------------------------------

  // Restore an unsaved draft for this doctor, if the rep left one.
  useEffect(() => {
    let active = true;
    void readJson<Draft>(draftKey(userId, pmdc))
      .then((draft) => {
        if (!active || !draft?.form) return;
        whatsappManual.current = Boolean(draft.whatsappManual);
        setForm({
          ...EMPTY_PROFILE,
          ...draft.form,
          // The register's identity wins over whatever the draft held.
          ...Object.fromEntries(
            Object.entries(identityFromList).filter(([, value]) => Boolean(value)),
          ),
        });
        setStep(Math.max(0, Math.min(Number(draft.step) || 0, STEPS.length - 1)));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
    // Once per doctor; the identity is derived from the same row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pmdc]);

  // Keep the draft current, debounced, once there is something worth keeping.
  useEffect(() => {
    if (!hydrated) return;
    const hasProgress =
      step > 0 ||
      Boolean(form.visitingCardUrl || form.religion || form.gender || form.age);
    if (!hasProgress) return;
    const timer = setTimeout(() => {
      void writeJson(draftKey(userId, pmdc), {
        form,
        step,
        whatsappManual: whatsappManual.current,
      } satisfies Draft);
    }, 450);
    return () => clearTimeout(timer);
  }, [form, step, hydrated, userId, pmdc]);

  // Each step starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [step]);

  // ---- field updates ------------------------------------------------------

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const update = (key: keyof DoctorProfileFields, value: string) => {
    setForm((prev) => {
      if (key === 'cellNo' && !whatsappManual.current) {
        return { ...prev, cellNo: value, whatsappNo: value };
      }
      if (key === 'whatsappNo') {
        whatsappManual.current = value !== prev.cellNo;
      }
      return { ...prev, [key]: value };
    });
    clearError(key);
    if (key === 'cellNo' && !whatsappManual.current) clearError('whatsappNo');
  };

  /** A new city empties its hospital — the old one belongs to another city. */
  const pickCity = (side: 'primary' | 'secondary', city: string) => {
    setForm((prev) => ({ ...prev, [`${side}City`]: city, [`${side}Hospital`]: '' }));
    clearError(`${side}City`);
  };

  const setPracticeLocations = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, practiceLocations: value };
      // One location: the secondary practice no longer exists — clear it so a
      // stale half-filled one is never submitted.
      if (!hasSecondaryPractice(value)) {
        for (const key of SECONDARY_FIELDS) next[key] = '';
      }
      return next;
    });
    clearError('practiceLocations');
  };

  // ---- PMDC lookup ----------------------------------------------------------

  /**
   * Fetch the doctor's identity from the PMDC register (DOC-FR-010). Needs a
   * connection; the assigned list usually carries it already, in which case
   * this is never called.
   */
  const verify = async (): Promise<DoctorProfileFields | null> => {
    setVerifying(true);
    setPmdcMessage(null);
    try {
      const record = await lookupPmdc(pmdc);
      if (!record) {
        setPmdcMessage('PMDC Number not found. Please verify and try again.');
        return null;
      }
      const next = {
        ...form,
        pmdcNumber: pmdc,
        pmdcStatus: normalizePmdcStatus(record.pmdcStatus) || record.pmdcStatus,
        doctorName: formatDoctorName(record.doctorName),
        fatherName: String(record.fatherName ?? '').trim(),
        issueDate: String(record.issueDate ?? '').trim(),
      };
      setForm(next);
      clearError('pmdcNumber');
      return next;
    } catch {
      setPmdcMessage(
        "Couldn't reach the server to verify this PMDC number. Connect to the internet and try again.",
      );
      return null;
    } finally {
      setVerifying(false);
    }
  };

  // ---- navigation -----------------------------------------------------------

  /** Errors for one step only — never leak red text into later steps. */
  const errorsFor = (stepIndex: number, snapshot: DoctorProfileFields) => {
    const all = validateProfile(snapshot);
    let fields = STEP_FIELDS[STEPS[stepIndex].id];
    if (STEPS[stepIndex].id === 'practice' && !hasSecondaryPractice(snapshot.practiceLocations)) {
      fields = fields.filter((field) => !field.startsWith('secondary'));
    }
    const stepErrors: Record<string, string> = {};
    for (const field of fields) {
      if (all[field]) stepErrors[field] = all[field];
    }
    return stepErrors;
  };

  const next = async () => {
    let snapshot = form;
    if (current.id === 'pmdc' && !form.doctorName) {
      const verified = await verify();
      if (!verified) return;
      snapshot = verified;
    }
    const stepErrors = errorsFor(step, snapshot);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      return;
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const back = () => {
    setErrors({});
    if (step === 0) {
      onExit();
      return;
    }
    setStep((value) => Math.max(value - 1, 0));
  };

  const submit = () => {
    if (submittingRef.current) return;
    const all = validateProfile(form);
    if (Object.keys(all).length) {
      // Send the rep to the first step with a problem, showing only its errors.
      const index = STEPS.findIndex((_, stepIndex) => Object.keys(errorsFor(stepIndex, form)).length);
      if (index >= 0) {
        setStep(index);
        setErrors(errorsFor(index, form));
      }
      Alert.alert('Incomplete', 'Please fix the highlighted fields before saving.');
      return;
    }

    submittingRef.current = true;
    save.mutate(
      {
        ...form,
        doctorName: formatDoctorName(form.doctorName),
        otherCompanyPrescribers: filledShares(form.otherCompanyPrescribers).map(
          (row: CompanyShare) => ({ company: row.company.trim(), percent: Number(row.percent) }),
        ),
      },
      {
        onSettled: () => {
          submittingRef.current = false;
        },
        onSuccess: () => {
          void removeRaw(draftKey(userId, pmdc)).catch(() => {});
          onSaved();
        },
        // The write is local, so only device storage can fail it — and then
        // the profile is NOT recorded anywhere. Worth saying so.
        onError: (error: any) =>
          Alert.alert(
            'Could not save',
            error?.message || 'Could not save this profile on the device. Please try again.',
          ),
      },
    );
  };

  // ---- steps ----------------------------------------------------------------

  const err = (key: string) => errors[key];

  const practiceSection = (side: 'primary' | 'secondary') => {
    const key = (name: string) => `${side}${name}` as keyof DoctorProfileFields;
    const value = (name: string) => String(form[key(name)] ?? '');
    const city = value('City');
    const specialities =
      side === 'secondary'
        ? DOCTOR_SPECIALITIES.filter((name) => name !== form.primarySpeciality)
        : DOCTOR_SPECIALITIES;

    return (
      <SectionCard
        title={showSecondary ? (side === 'primary' ? 'Primary Practice' : 'Secondary Practice') : 'Practice Location'}
        icon="business-outline"
      >
        <Field label="Speciality" required error={err(key('Speciality'))}>
          <SelectField
            options={specialities}
            value={value('Speciality')}
            onChange={(next) => update(key('Speciality'), next)}
            placeholder="Select speciality"
            title="Select Speciality"
            invalid={Boolean(err(key('Speciality')))}
          />
        </Field>
        <Field label="City" required error={err(key('City'))}>
          <SelectField
            options={cities}
            value={city}
            onChange={(next) => pickCity(side, next)}
            placeholder="Select city"
            title="Select City"
            invalid={Boolean(err(key('City')))}
          />
        </Field>
        <Field label="Hospital" required help={FIELD_HELP.hospital} error={err(key('Hospital'))}>
          <HospitalField
            // Remounted per city, so "type a new one" never carries across.
            key={`${side}-${city}`}
            hospitals={hospitalsFor(city)}
            value={value('Hospital')}
            onChange={(next) => update(key('Hospital'), next)}
            city={city}
            invalid={Boolean(err(key('Hospital')))}
          />
        </Field>
        <Field label="Session" required help={FIELD_HELP.session} error={err(key('Session'))}>
          <ChoiceChips
            options={SESSION_TIMES}
            value={value('Session')}
            onChange={(next) => update(key('Session'), next)}
            invalid={Boolean(err(key('Session')))}
          />
        </Field>
        <FieldRow>
          <Field label="Fee / Patient" required inRow error={err(key('Fee'))}>
            <TextField
              value={value('Fee')}
              onChangeText={(next) => update(key('Fee'), numeric(next, 7))}
              placeholder="Rs"
              keyboardType="number-pad"
              invalid={Boolean(err(key('Fee')))}
            />
          </Field>
          <Field label="Avg Time (min)" required inRow error={err(key('AvgTime'))}>
            <TextField
              value={value('AvgTime')}
              onChangeText={(next) => update(key('AvgTime'), numeric(next, 3))}
              placeholder="Minutes"
              keyboardType="number-pad"
              invalid={Boolean(err(key('AvgTime')))}
            />
          </Field>
        </FieldRow>
        <Field label="Patients / Day" required error={err(key('PatientsPerDay'))}>
          <TextField
            value={value('PatientsPerDay')}
            onChangeText={(next) => update(key('PatientsPerDay'), numeric(next, 4))}
            placeholder="Number of patients"
            keyboardType="number-pad"
            invalid={Boolean(err(key('PatientsPerDay')))}
          />
        </Field>
        <Field label="OPD Timing" required error={err(key('OpdTiming'))}>
          <SelectField
            options={OPD_TIMINGS}
            value={value('OpdTiming')}
            onChange={(next) => update(key('OpdTiming'), next)}
            placeholder="Select OPD timing"
            title="Select OPD Timing"
            invalid={Boolean(err(key('OpdTiming')))}
          />
        </Field>
        <Field
          label="Best Visiting Time"
          required
          help={FIELD_HELP.bestVisitingTime}
          error={err(key('BestVisitingTime'))}
        >
          <SelectField
            options={BEST_VISITING_TIMES}
            value={value('BestVisitingTime')}
            onChange={(next) => update(key('BestVisitingTime'), next)}
            placeholder="Select time"
            title="Select Best Visiting Time"
            invalid={Boolean(err(key('BestVisitingTime')))}
            searchable
          />
        </Field>
        <Field
          label="Appointment System"
          required
          help={FIELD_HELP.appointmentSystem}
          error={err(key('AppointmentSystem'))}
        >
          <ChoiceChips
            options={APPOINTMENT_SYSTEMS}
            value={value('AppointmentSystem')}
            onChange={(next) => update(key('AppointmentSystem'), next)}
            invalid={Boolean(err(key('AppointmentSystem')))}
          />
        </Field>
      </SectionCard>
    );
  };

  const renderStep = () => {
    switch (current.id) {
      case 'pmdc':
        return (
          <SectionCard>
            <Field label="PMDC Number" required error={err('pmdcNumber')}>
              <ReadOnlyValue value={pmdc} />
            </Field>
            {pmdcMessage ? <Text style={styles.errorText}>{pmdcMessage}</Text> : null}
            {!form.doctorName ? (
              <AppButton
                label={verifying ? 'Verifying…' : 'Verify Registration'}
                variant="outline"
                onPress={verifying ? undefined : () => void verify()}
                icon={<Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />}
              />
            ) : null}
            <FieldRow>
              <Field label="PMDC Status" inRow>
                <ReadOnlyValue value={form.pmdcStatus} />
              </Field>
              <Field label="Issue Date" inRow>
                <ReadOnlyValue value={form.issueDate} />
              </Field>
            </FieldRow>
            <Field label="Doctor Name">
              <ReadOnlyValue value={formatDoctorName(form.doctorName)} />
            </Field>
            <Field label="Father's Name">
              <ReadOnlyValue value={form.fatherName} />
            </Field>
            <Field
              label="Visiting Card"
              required
              help="Photograph the doctor's visiting card — required to continue."
              error={err('visitingCardUrl')}
            >
              <VisitingCardPicker
                value={form.visitingCardUrl}
                onChange={(next) => update('visitingCardUrl', next)}
                invalid={Boolean(err('visitingCardUrl'))}
              />
            </Field>
          </SectionCard>
        );

      case 'personal':
        return (
          <SectionCard>
            <Field label="Religion" required error={err('religion')}>
              <ChoiceChips
                options={RELIGIONS}
                value={form.religion}
                onChange={(next) => update('religion', next)}
                invalid={Boolean(err('religion'))}
              />
            </Field>
            <FieldRow>
              <Field label="Age" required inRow error={err('age')}>
                <TextField
                  value={form.age}
                  onChangeText={(next) => update('age', numeric(next, 3))}
                  placeholder="Years"
                  keyboardType="number-pad"
                  invalid={Boolean(err('age'))}
                />
              </Field>
              <Field label="Gender" required inRow error={err('gender')}>
                <ChoiceChips
                  options={GENDERS}
                  value={form.gender}
                  onChange={(next) => update('gender', next)}
                  invalid={Boolean(err('gender'))}
                />
              </Field>
            </FieldRow>
            <Field label="Cell No" required error={err('cellNo')}>
              <TextField
                value={form.cellNo}
                onChangeText={(next) => update('cellNo', formatPkMobile(next))}
                placeholder="03XXXXXXXXX"
                keyboardType="phone-pad"
                maxLength={11}
                invalid={Boolean(err('cellNo'))}
              />
            </Field>
            <Field
              label="WhatsApp No"
              required
              help="Copied from the cell number — change it if WhatsApp is different."
              error={err('whatsappNo')}
            >
              <TextField
                value={form.whatsappNo}
                onChangeText={(next) => update('whatsappNo', formatPkMobile(next))}
                placeholder="03XXXXXXXXX"
                keyboardType="phone-pad"
                maxLength={11}
                invalid={Boolean(err('whatsappNo'))}
              />
            </Field>
            <Field
              label="Digital Comfort Level"
              required
              help={FIELD_HELP.digitalComfortLevel}
              error={err('digitalComfortLevel')}
            >
              <ChoiceChips
                options={DIGITAL_COMFORT_LEVELS}
                value={form.digitalComfortLevel}
                onChange={(next) => update('digitalComfortLevel', next)}
                invalid={Boolean(err('digitalComfortLevel'))}
              />
            </Field>
          </SectionCard>
        );

      case 'professional':
        return (
          <SectionCard>
            <Field
              label="No. of Practice Locations"
              required
              help={FIELD_HELP.practiceLocations}
              error={err('practiceLocations')}
            >
              <ChoiceChips
                options={PRACTICE_LOCATIONS}
                value={form.practiceLocations}
                onChange={setPracticeLocations}
                invalid={Boolean(err('practiceLocations'))}
              />
            </Field>
            <Field
              label="Practice Type"
              required
              help={FIELD_HELP.practiceType}
              error={err('practiceType')}
            >
              <ChoiceChips
                options={PRACTICE_TYPES}
                value={form.practiceType}
                onChange={(next) => update('practiceType', next)}
                invalid={Boolean(err('practiceType'))}
              />
            </Field>
          </SectionCard>
        );

      case 'practice':
        return (
          <View style={styles.stack}>
            {practiceSection('primary')}
            {showSecondary ? practiceSection('secondary') : null}
          </View>
        );

      case 'commercial':
        return (
          <SectionCard>
            <Field
              label="Innovation & Medicine Adoption"
              required
              help={FIELD_HELP.innovationAdoption}
              error={err('innovationAdoption')}
            >
              <ChoiceChips
                options={ADOPTION_LEVELS}
                value={form.innovationAdoption}
                onChange={(next) => update('innovationAdoption', next)}
                invalid={Boolean(err('innovationAdoption'))}
              />
            </Field>
            <Field label="Access Type" required help={FIELD_HELP.accessType} error={err('accessType')}>
              <ChoiceChips
                options={ACCESS_TYPES}
                value={form.accessType}
                onChange={(next) => update('accessType', next)}
                invalid={Boolean(err('accessType'))}
              />
            </Field>
            <Field
              label="Preferred Interaction Style"
              required
              help={FIELD_HELP.preferredInteractionStyle}
              error={err('preferredInteractionStyle')}
            >
              <ChoiceChips
                options={INTERACTION_STYLES}
                value={form.preferredInteractionStyle}
                onChange={(next) => update('preferredInteractionStyle', next)}
                invalid={Boolean(err('preferredInteractionStyle'))}
              />
            </Field>
            <Field label="TSCL Prescriber" required help={FIELD_HELP.rxStatus} error={err('rxStatus')}>
              <ChoiceChips
                options={RX_STATUSES}
                value={form.rxStatus}
                onChange={(next) => update('rxStatus', next)}
                invalid={Boolean(err('rxStatus'))}
              />
            </Field>
            <FieldRow>
              <Field label="Rx Patterns" required inRow help={FIELD_HELP.rxPatterns} error={err('rxPatterns')}>
                <ChoiceChips
                  options={RX_PATTERNS}
                  value={form.rxPatterns}
                  onChange={(next) => update('rxPatterns', next)}
                  invalid={Boolean(err('rxPatterns'))}
                />
              </Field>
              <Field
                label="Pharmacy Ownership"
                required
                inRow
                help={FIELD_HELP.pharmacyOwnership}
                error={err('pharmacyOwnership')}
              >
                <ChoiceChips
                  options={PHARMACY_OWNERSHIP}
                  value={form.pharmacyOwnership}
                  onChange={(next) => update('pharmacyOwnership', next)}
                  invalid={Boolean(err('pharmacyOwnership'))}
                />
              </Field>
            </FieldRow>
            <Field label="Other Company Prescriber" required error={err('otherCompanyPrescribers')}>
              <CompanySharesField
                value={form.otherCompanyPrescribers}
                onChange={(next) => {
                  setForm((prev) => ({ ...prev, otherCompanyPrescribers: next }));
                  clearError('otherCompanyPrescribers');
                }}
                companies={companies}
                invalid={Boolean(err('otherCompanyPrescribers'))}
              />
              {companies.length === 0 ? (
                <Text style={styles.hint}>
                  {masterQuery.isLoading
                    ? 'Loading the company list…'
                    : 'The company list loads the first time you are online.'}
                </Text>
              ) : null}
            </Field>
          </SectionCard>
        );

      case 'review':
        return <ProfileDetails profile={{ ...form, id: 'review' }} />;
    }
  };

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {/* Raised bar over the step, like the list screens' sticky header. */}
      <View style={styles.stickyHeader}>
        <View style={styles.stepTitleRow}>
          <Text style={styles.stepCount}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text style={styles.stepTitle} numberOfLines={1}>
            {current.title}
          </Text>
        </View>
        <View style={styles.segments}>
          {STEPS.map((entry, index) => (
            <View
              key={entry.id}
              style={[styles.segment, index <= step && styles.segmentDone]}
            />
          ))}
        </View>
        {form.doctorName ? (
          <View style={styles.doctorBanner}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.doctorBannerText} numberOfLines={1}>
              {formatDoctorName(form.doctorName)}
            </Text>
            <Text style={styles.doctorBannerCode}>PMDC {pmdc}</Text>
          </View>
        ) : null}
        <Text style={styles.stepDescription}>{current.description}</Text>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <AppButton
          label={step === 0 ? 'Change Doctor' : 'Back'}
          variant="secondary"
          onPress={back}
          style={styles.footerButton}
        />
        {current.id === 'review' ? (
          <AppButton
            label={save.isPending ? 'Saving…' : 'Save Profile'}
            onPress={save.isPending ? undefined : submit}
            style={[styles.footerButton, save.isPending && styles.footerButtonDisabled]}
          />
        ) : (
          <AppButton
            label={verifying ? 'Verifying…' : 'Next'}
            onPress={verifying ? undefined : () => void next()}
            style={[styles.footerButton, verifying && styles.footerButtonDisabled]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyHeader: {
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 5,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  stepCount: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  segmentDone: {
    backgroundColor: Colors.primary,
  },
  doctorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doctorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  doctorBannerCode: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  stepDescription: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  stack: {
    gap: 14,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  // The patient form's footer.
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  footerButton: {
    flex: 1,
  },
  footerButtonDisabled: {
    backgroundColor: Colors.disabledBg,
  },
});
