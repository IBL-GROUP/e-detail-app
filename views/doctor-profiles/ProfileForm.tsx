import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/theme';
import { toDataUrl } from '@/lib/offline/patientAttachments';
import { shrinkCardForWeb } from '@/lib/offline/visitingCards';
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type DoctorProfileDraft,
} from '@/lib/offline/doctorProfileDrafts';
import {
  addHospitalNow,
  lookupPmdc,
  type SaveProfileResult,
  useDoctorProfileMaster,
  useSaveDoctorProfile,
  type AssignedDoctor,
  type CompanyShare,
  type DoctorProfileFields,
} from '@/api/doctorProfiles';
import { CompanySharesField } from './CompanySharesField';
import {
  ChoiceChips,
  DetailRow,
  Field,
  FieldRegistryProvider,
  FieldRow,
  FormStepper,
  HospitalField,
  LocationCard,
  ReadOnlyValue,
  RecordBanner,
  SectionCard,
  SelectField,
  TextField,
} from './formParts';
import { VisitingCardPicker } from './VisitingCardPicker';
import {
  ACCESS_TYPES,
  ADOPTION_LEVELS,
  APPOINTMENT_SYSTEMS,
  BEST_VISITING_TIMES,
  DIGITAL_COMFORT_LEVELS,
  DOCTOR_SPECIALITIES,
  DEFAULT_PRACTICE_LOCATIONS,
  EMPTY_PROFILE,
  EMPTY_SITE,
  FALLBACK_CITIES,
  FIELD_HELP,
  GENDERS,
  INTERACTION_STYLES,
  OPD_TIMINGS,
  PHARMACY_OWNERSHIP,
  PMDC_STEP_HINT,
  PRACTICE_TYPES,
  RELIGIONS,
  RX_PATTERNS,
  RX_STATUSES,
  SESSION_TIMES,
  STEPS,
  STEP_FIELDS,
  filledShares,
  formatDoctorName,
  formatPkMobile,
  normalizePmdcStatus,
  siteFieldKeys,
  siteIndexOf,
  siteClashes,
  siteKey,
  sitesOf,
  sitesPayload,
  validateProfile,
  visibleSites,
  type SiteField,
} from './profileRules';

/** Digits only, for the numeric boxes. */
const numeric = (value: string, max: number) => value.replace(/[^0-9]/g, '').slice(0, max);

/** A DINFO-BR-013 speciality-clash message (see siteClashes). */
const CLASH_MESSAGE = / is already entered for .* at Location \d+\.$/;

/** The PMDC register's half of the profile. */
type Identity = Pick<
  DoctorProfileFields,
  'pmdcNumber' | 'pmdcStatus' | 'doctorName' | 'fatherName' | 'issueDate'
>;

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
 * Capture one doctor's profile: the Searle app's six steps and screen layout
 * (stepper, doctor banner, review card), built with this app's components and
 * colours. Step 4 has one card per practice location (DINFO-FR-011).
 *
 * Offline-first like everything a rep records here. The in-progress form is
 * saved on the device as a draft (so a killed app loses nothing), and Save
 * writes to the profile queue, which uploads the visiting card and the profile
 * on the next flush. Only the PMDC lookup needs signal.
 */
export function ProfileForm({ doctor, userId, mieId, onExit, onSaved }: ProfileFormProps) {
  const pmdc = doctor.pmdcNumber.trim().toUpperCase();
  const identityFromList: Identity = {
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
  /**
   * What happened to the last Save, shown above the buttons. Alert.alert alone
   * is not enough: on web it does nothing at all, and on a phone a failed
   * Save jumps to another step — either way it looked like "Save does nothing".
   */
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  /** Set when Save stored the profile on the device but the server refused it. */
  const [queuedError, setQueuedError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** The Step 4 location cards that are expanded (DINFO-FR-011): Location 1 to start. */
  const [openSites, setOpenSites] = useState<Set<number>>(() => new Set([0]));
  // Until the rep changes WhatsApp by hand, it follows the cell number.
  const whatsappManual = useRef(false);
  const scrollRef = useRef<any>(null);
  const contentRef = useRef<View>(null);
  const fieldNodes = useRef(new Map<string, View | null>());
  // Set synchronously on the first tap of Save — see the patient screen.
  const submittingRef = useRef(false);
  // The draft as last edited, and whether it still has to be written.
  const latestDraft = useRef<DoctorProfileDraft | null>(null);
  const draftDirty = useRef(false);
  // Once saved, the draft must not be written back on the way out.
  const savedRef = useRef(false);

  const masterQuery = useDoctorProfileMaster();
  const queryClient = useQueryClient();

  /** True when the master list already has this hospital for this city. */
  const isMasterHospital = (cityName: string, hospitalName: string) => {
    const city = (masterQuery.data?.cities ?? []).find(
      (entry) => entry.name.toLowerCase() === cityName.trim().toLowerCase(),
    );
    if (!city) return false;
    return (masterQuery.data?.hospitals ?? []).some(
      (hospital) =>
        hospital.cityId === city.id &&
        hospital.name.trim().toLowerCase() === hospitalName.trim().toLowerCase(),
    );
  };
  const save = useSaveDoctorProfile(userId, mieId);

  const current = STEPS[step];
  const sites = visibleSites(form);

  // ---- master lists -------------------------------------------------------

  const cities = useMemo(() => {
    const names = (masterQuery.data?.cities ?? []).map((city) => city.name).filter(Boolean);
    return names.length ? names : FALLBACK_CITIES;
  }, [masterQuery.data?.cities]);

  /**
   * The city's hospitals from the master list, plus any hospital the rep has
   * added on this form for that city — so one added for one location is
   * offered for another location in the same city too (Searle keeps it in the
   * session list the same way). The server adds it to the master when the
   * profile lands (DOC-BR-012).
   */
  const hospitalsFor = (cityName: string) => {
    const lower = cityName.trim().toLowerCase();
    if (!lower) return [];
    const city = (masterQuery.data?.cities ?? []).find(
      (entry) => entry.name.toLowerCase() === lower,
    );
    const names = city
      ? (masterQuery.data?.hospitals ?? [])
          .filter((hospital) => hospital.cityId === city.id)
          .map((hospital) => hospital.name)
      : [];
    const added = sites
      .filter((site) => site.city.trim().toLowerCase() === lower)
      .map((site) => site.hospital.trim())
      .filter(Boolean);
    const merged = [...names];
    for (const name of added) {
      if (!merged.some((entry) => entry.toLowerCase() === name.toLowerCase())) merged.push(name);
    }
    return merged.sort((left, right) => left.localeCompare(right));
  };

  const companies = useMemo(
    () => (masterQuery.data?.pharma ?? []).map((entry) => entry.name).filter(Boolean),
    [masterQuery.data?.pharma],
  );

  // ---- PMDC lookup ----------------------------------------------------------

  /**
   * Fetch the doctor's identity from the PMDC register (DOC-FR-010) and merge
   * it into the CURRENT form, so nothing typed meanwhile is lost. `quiet`:
   * don't complain when offline — used for the automatic lookup on open.
   */
  const verify = async (quiet = false): Promise<Identity | null> => {
    setVerifying(true);
    if (!quiet) setPmdcMessage(null);
    try {
      const record = await lookupPmdc(pmdc);
      if (!record) {
        setPmdcMessage('PMDC Number not found. Please verify and try again.');
        return null;
      }
      const identity: Identity = {
        pmdcNumber: pmdc,
        pmdcStatus: normalizePmdcStatus(record.pmdcStatus) || String(record.pmdcStatus ?? ''),
        doctorName: formatDoctorName(record.doctorName),
        fatherName: String(record.fatherName ?? '').trim(),
        issueDate: String(record.issueDate ?? '').trim(),
      };
      setForm((prev) => ({ ...prev, ...identity }));
      setPmdcMessage(null);
      clearError('pmdcNumber');
      return identity;
    } catch {
      if (!quiet) {
        setPmdcMessage(
          "Couldn't reach the server to verify this PMDC number. Connect to the internet and try again.",
        );
      }
      return null;
    } finally {
      setVerifying(false);
    }
  };

  // ---- draft --------------------------------------------------------------

  // Restore an unsaved draft for this doctor, if the rep left one; then, as
  // Searle does on open, look the PMDC up when the list didn't carry the full
  // identity (father's name / issue date).
  useEffect(() => {
    let active = true;
    void loadDraft(userId, pmdc)
      .then((draft) => {
        if (!active || !draft) return;
        whatsappManual.current = Boolean(draft.whatsappManual);
        setForm({
          ...EMPTY_PROFILE,
          ...draft.form,
          // A web blob: URL dies with the page that made it, so one in a
          // restored draft is always dead — ask for the card again rather
          // than fail at Save with "Failed to fetch".
          visitingCardUrl: String(draft.form.visitingCardUrl ?? '').startsWith('blob:')
            ? ''
            : draft.form.visitingCardUrl,
          // DINFO-BR-009: drafts saved before the default existed start at 1 too.
          practiceLocations: draft.form.practiceLocations || DEFAULT_PRACTICE_LOCATIONS,
          // DINFO-DATA-004: a draft from before practiceSites existed keeps its
          // primary/secondary practice as Locations 1 and 2.
          practiceSites: sitesOf(draft.form),
          // The register's identity wins over whatever the draft held.
          ...Object.fromEntries(
            Object.entries(identityFromList).filter(([, value]) => Boolean(value)),
          ),
        });
        setStep(Math.max(0, Math.min(Number(draft.step) || 0, STEPS.length - 1)));
        // Web: a full-size photo saved in an older draft fills the browser's
        // storage — shrink it now (the debounced draft save then stores the
        // smaller copy).
        const card = String(draft.form.visitingCardUrl ?? '');
        if (card.startsWith('data:')) {
          void shrinkCardForWeb(card).then((smaller) => {
            if (active && smaller !== card) {
              setForm((prev) =>
                prev.visitingCardUrl === card ? { ...prev, visitingCardUrl: smaller } : prev,
              );
            }
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        setHydrated(true);
        const { doctorName, fatherName, issueDate, pmdcStatus } = identityFromList;
        if (!doctorName || !fatherName || !issueDate || !pmdcStatus) void verify(true);
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
      form.cellNo.replace(/\D/g, '').length >= 11 ||
      Boolean(
        form.religion ||
          form.gender ||
          form.age ||
          // The default of 1 alone is not progress.
          (form.practiceLocations && form.practiceLocations !== DEFAULT_PRACTICE_LOCATIONS) ||
          form.practiceSites.some((site) => site.hospital || site.city) ||
          form.visitingCardUrl,
      );
    if (!hasProgress) return;
    const draft: DoctorProfileDraft = { form, step, whatsappManual: whatsappManual.current };
    latestDraft.current = draft;
    draftDirty.current = true;
    const timer = setTimeout(() => {
      draftDirty.current = false;
      void saveDraft(userId, pmdc, draft);
    }, 450);
    return () => clearTimeout(timer);
  }, [form, step, hydrated, userId, pmdc]);

  // Leaving the form (Change Doctor, the back arrow, another tab) must not drop
  // the last edits still waiting on the debounce above — write them now.
  useEffect(() => {
    const dirty = draftDirty;
    const latest = latestDraft;
    const saved = savedRef;
    return () => {
      if (dirty.current && latest.current && !saved.current) {
        void saveDraft(userId, pmdc, latest.current);
      }
    };
  }, [userId, pmdc]);

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
        whatsappManual.current = value.replace(/\D/g, '') !== prev.cellNo.replace(/\D/g, '');
      }
      return { ...prev, [key]: value };
    });
    clearError(key);
    if (key === 'cellNo' && !whatsappManual.current) clearError('whatsappNo');
  };

  /**
   * Change fields of location `index`. Locations up to it that don't exist
   * yet are created empty; locations beyond N are never touched, so they come
   * back as they were if N is raised again (DINFO-BR-011).
   */
  const updateSite = (index: number, changes: Partial<Record<SiteField, string>>) => {
    const withChange = (list: DoctorProfileFields['practiceSites']) => {
      const practiceSites = [...list];
      while (practiceSites.length <= index) practiceSites.push(EMPTY_SITE);
      practiceSites[index] = { ...practiceSites[index], ...changes };
      return practiceSites;
    };
    setForm((prev) => ({ ...prev, practiceSites: withChange(prev.practiceSites) }));
    (Object.keys(changes) as SiteField[]).forEach((field) => clearError(siteKey(index, field)));

    // DINFO-BR-013: a speciality clash shows the moment the speciality, city
    // or hospital that causes it is chosen — and goes once it is resolved.
    // It is reported on the later location, which may be another card.
    if ('speciality' in changes || 'hospital' in changes || 'city' in changes) {
      const clashes = siteClashes(
        visibleSites({ ...form, practiceSites: withChange(form.practiceSites) }),
      );
      setErrors((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (key.endsWith('.speciality') && CLASH_MESSAGE.test(next[key])) delete next[key];
        }
        return { ...next, ...clashes };
      });
      openSitesWithErrors(clashes);
    }
  };

  // DINFO-BR-009: typed, digits only, leading zeros dropped, no upper limit.
  // DINFO-BR-011: lowering it only hides locations; nothing is cleared.
  const setPracticeLocations = (raw: string) => {
    const value = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    setForm((prev) => ({ ...prev, practiceLocations: value }));
    clearError('practiceLocations');
  };

  const toggleSite = (index: number) =>
    setOpenSites((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  /** Expand every location card that has an error, so the error can be seen. */
  const openSitesWithErrors = (stepErrors: Record<string, string>) => {
    const indexes = Object.keys(stepErrors)
      .map(siteIndexOf)
      .filter((index): index is number => index != null);
    if (!indexes.length) return false;
    setOpenSites((prev) => new Set([...prev, ...indexes]));
    return true;
  };

  // ---- navigation -----------------------------------------------------------

  const registerField = (name: string, node: View | null) => {
    if (node) fieldNodes.current.set(name, node);
    else fieldNodes.current.delete(name);
  };

  /** Bring the first field with an error into view (Searle's scrollToFirstError). */
  const scrollToFirstError = (fields: string[], stepErrors: Record<string, string>) => {
    const first = fields.find((field) => stepErrors[field]);
    const node = first ? fieldNodes.current.get(first) : null;
    const content = contentRef.current;
    requestAnimationFrame(() => {
      if (!node || !content) {
        scrollRef.current?.scrollTo?.({ y: 0, animated: true });
        return;
      }
      node.measureLayout(
        content as any,
        (_x, y) => scrollRef.current?.scrollTo?.({ y: Math.max(0, y - 12), animated: true }),
        () => scrollRef.current?.scrollTo?.({ y: 0, animated: true }),
      );
    });
  };

  /** The fields one step owns — on Step 4, those of the N shown locations. */
  const fieldsFor = (stepIndex: number, snapshot: DoctorProfileFields) => {
    if (STEPS[stepIndex].id === 'practice') return siteFieldKeys(visibleSites(snapshot).length);
    return STEP_FIELDS[STEPS[stepIndex].id];
  };

  /** Errors for one step only — never leak red text into later steps. */
  const errorsFor = (stepIndex: number, snapshot: DoctorProfileFields) => {
    const all = validateProfile(snapshot);
    const stepErrors: Record<string, string> = {};
    for (const field of fieldsFor(stepIndex, snapshot)) {
      if (all[field]) stepErrors[field] = all[field];
    }
    return stepErrors;
  };

  const next = async () => {
    let snapshot = form;
    if (current.id === 'pmdc' && !form.doctorName) {
      const identity = await verify();
      if (!identity) return;
      // setForm is async — validate against the looked-up identity.
      snapshot = { ...form, ...identity };
    }
    const stepErrors = errorsFor(step, snapshot);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      // A collapsed card's fields aren't on screen: open it, then scroll.
      if (openSitesWithErrors(stepErrors)) {
        setTimeout(() => scrollToFirstError(fieldsFor(step, snapshot), stepErrors), 80);
      } else {
        scrollToFirstError(fieldsFor(step, snapshot), stepErrors);
      }
      return;
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const back = () => {
    setErrors({});
    setSubmitMessage(null);
    if (step === 0) {
      onExit();
      return;
    }
    setStep((value) => Math.max(value - 1, 0));
  };

  /** Open a step showing only its errors, scrolled to the first one. */
  const goToStepErrors = (index: number) => {
    const stepErrors = errorsFor(index, form);
    setStep(index);
    setErrors(stepErrors);
    openSitesWithErrors(stepErrors);
    setTimeout(() => scrollToFirstError(fieldsFor(index, form), stepErrors), 80);
  };

  /** Steps that still have problems, for the Review checklist. */
  const stepsWithProblems = () =>
    STEPS.map((entry, index) => ({ entry, index, count: Object.keys(errorsFor(index, form)).length }))
      .filter((row) => row.count > 0);

  const submit = () => {
    submitProfile().catch((error: any) => {
      // Never fail silently — say what went wrong.
      submittingRef.current = false;
      savedRef.current = false;
      console.warn('[doctor-profiles] save failed', error);
      setSubmitMessage(`Could not save: ${error?.message ?? 'unexpected error'}. Please try again.`);
    });
  };

  const submitProfile = async () => {
    // Saving, or already saved: a second tap must never queue the profile twice.
    if (submittingRef.current || savedRef.current) return;
    setSubmitMessage(null);
    const all = validateProfile(form);
    if (Object.keys(all).length) {
      // Send the rep to the first step with a problem, showing only its errors.
      const index = STEPS.findIndex((_, stepIndex) => Object.keys(errorsFor(stepIndex, form)).length);
      const message =
        index >= 0
          ? `Not saved — "${STEPS[index].title}" has fields to fix. They are marked in red.`
          : 'Not saved — some fields still need attention.';
      if (index >= 0) goToStepErrors(index);
      setSubmitMessage(message);
      Alert.alert('Incomplete', message);
      return;
    }

    submittingRef.current = true;
    savedRef.current = true;

    // Web: a card picked before this fix is a blob: URL, which the browser
    // may already have thrown away. Read it now; if it's gone, say so plainly
    // and send the rep back to capture it, instead of "Failed to fetch".
    let visitingCardUrl = form.visitingCardUrl;
    if (visitingCardUrl.startsWith('blob:')) {
      try {
        visitingCardUrl = await toDataUrl(visitingCardUrl);
      } catch {
        savedRef.current = false;
        submittingRef.current = false;
        const message =
          'Not saved — the visiting card photo is no longer available. Please capture it again.';
        setForm((prev) => ({ ...prev, visitingCardUrl: '' }));
        setStep(0);
        setErrors({ visitingCardUrl: 'Capture the visiting card again' });
        setSubmitMessage(message);
        Alert.alert('Capture the card again', message);
        return;
      }
    }
    // Web: keep the stored copy small (see shrinkCardForWeb). No-op on phones.
    visitingCardUrl = await shrinkCardForWeb(visitingCardUrl);

    const payload = {
      ...form,
      // DINFO-DATA-003: the first N locations, with primary*/secondary*
      // mirroring locations 1 and 2 (hospital names trimmed).
      ...sitesPayload(form),
      visitingCardUrl,
      doctorName: formatDoctorName(form.doctorName),
      otherCompanyPrescribers: filledShares(form.otherCompanyPrescribers).map(
        (row: CompanyShare) => ({ company: row.company.trim(), percent: Number(row.percent) }),
      ),
    };

    let result: SaveProfileResult;
    try {
      // mutateAsync, not mutate(…, { onSuccess }): the saved profile shows up
      // on the device before this resolves, which can unmount this form — and
      // React Query drops a mutate() callback whose component has gone, so the
      // draft was never cleared and the screen never went back to the list.
      try {
        result = await save.mutateAsync(payload);
      } catch (error: any) {
        if (!/storage is full/i.test(String(error?.message ?? ''))) throw error;
        // Web: the draft holds a second copy of this same profile, photo and
        // all. Free that space and try once more — the form is still on
        // screen, and the draft is written back below if this fails too.
        await clearDraft(userId, pmdc).catch(() => {});
        try {
          result = await save.mutateAsync(payload);
        } catch (retryError) {
          await saveDraft(userId, pmdc, {
            form,
            step,
            whatsappManual: whatsappManual.current,
          }).catch(() => {});
          throw retryError;
        }
      }
    } catch (error: any) {
      savedRef.current = false;
      submittingRef.current = false;
      // The write is local, so only device storage can fail it — and then
      // the profile is NOT recorded anywhere. Worth saying so.
      const message = `Could not save: ${
        error?.message || 'the profile could not be stored on this device'
      }. Please try again.`;
      console.warn('[doctor-profiles] save failed', error);
      setSubmitMessage(message);
      Alert.alert('Could not save', message);
      return;
    }
    // savedRef stays true: this form is done, and Save is ignored from here on.
    // The profile is safely queued either way, so the draft can go.
    await clearDraft(userId, pmdc).catch(() => {});
    submittingRef.current = false;

    if (result.synced || result.offline) {
      // Saved to the server — or no signal, so it uploads when back online.
      onSaved();
      return;
    }
    // Online, but the server didn't store it. Say why, plainly: this is the
    // case that used to look like "saved" while nothing reached the database.
    const message =
      `Saved on this device, but NOT on the server yet: ${result.error}. ` +
      'It will retry automatically, or open the doctor and tap Retry Upload.';
    setQueuedError(message);
    setSubmitMessage(message);
    Alert.alert('Not saved on the server yet', message);
  };

  // ---- practice fields ------------------------------------------------------

  const err = (key: string) => errors[key];

  /**
   * One practice location's ten fields, in Searle's order (DINFO-FR-011),
   * keyed siteKey(index, field) so an error can scroll to it. Every location
   * offers the full speciality list (DINFO-BR-012).
   */
  const siteFields = (index: number) => {
    const site = sites[index];
    const key = (field: SiteField) => siteKey(index, field);
    const sheetTitle = (label: string) => `Location ${index + 1} · ${label}`;

    return [
      <Field key="speciality" name={key('speciality')} label="Speciality" required error={err(key('speciality'))}>
        <SelectField
          options={DOCTOR_SPECIALITIES}
          value={site.speciality}
          onChange={(next) => updateSite(index, { speciality: next })}
          placeholder="Select an option"
          title={sheetTitle('Speciality')}
          invalid={Boolean(err(key('speciality')))}
          searchable
        />
      </Field>,
      <Field key="city" name={key('city')} label="City" required error={err(key('city'))}>
        <SelectField
          options={cities}
          value={site.city}
          // DINFO-BR-008: a new city empties the hospital — it belongs to another city.
          onChange={(next) => updateSite(index, { city: next, hospital: '' })}
          placeholder="Select an option"
          title={sheetTitle('City')}
          invalid={Boolean(err(key('city')))}
          searchable
        />
      </Field>,
      <Field
        key="hospital"
        name={key('hospital')}
        label="Hospital"
        required
        help={FIELD_HELP.hospital}
        error={err(key('hospital'))}
      >
        <HospitalField
          hospitals={hospitalsFor(site.city)}
          value={site.hospital}
          onChange={(next) => {
            updateSite(index, { hospital: next });
            // A hospital typed in (not in the master list): add it to the
            // database now, as Searle does (DOC-FR-017). Offline, the server
            // still adds it when the profile uploads (DOC-BR-012).
            if (next && site.city && !isMasterHospital(site.city, next)) {
              void addHospitalNow(queryClient, site.city, next);
            }
          }}
          city={site.city}
          title={sheetTitle('Hospital')}
          invalid={Boolean(err(key('hospital')))}
        />
      </Field>,
      <Field key="session" name={key('session')} label="Session" required error={err(key('session'))}>
        <ChoiceChips
          options={SESSION_TIMES}
          value={site.session}
          onChange={(next) => updateSite(index, { session: next })}
          invalid={Boolean(err(key('session')))}
        />
      </Field>,
      <FieldRow key="numbers">
        <Field name={key('fee')} label="Fee / Patient" required inRow error={err(key('fee'))}>
          <TextField
            value={site.fee}
            onChangeText={(next) => updateSite(index, { fee: numeric(next, 7) })}
            placeholder="Numbers only"
            keyboardType="number-pad"
            invalid={Boolean(err(key('fee')))}
          />
        </Field>
        <Field name={key('avgTime')} label="Avg Time / Patient" required inRow error={err(key('avgTime'))}>
          <TextField
            value={site.avgTime}
            onChangeText={(next) => updateSite(index, { avgTime: numeric(next, 3) })}
            placeholder="Minutes (numbers only)"
            keyboardType="number-pad"
            invalid={Boolean(err(key('avgTime')))}
          />
        </Field>
        <Field
          name={key('patientsPerDay')}
          label="No# Patient/Day"
          required
          inRow
          error={err(key('patientsPerDay'))}
        >
          <TextField
            value={site.patientsPerDay}
            onChangeText={(next) => updateSite(index, { patientsPerDay: numeric(next, 4) })}
            keyboardType="number-pad"
            invalid={Boolean(err(key('patientsPerDay')))}
          />
        </Field>
      </FieldRow>,
      <Field key="opdTiming" name={key('opdTiming')} label="OPD Timing" required error={err(key('opdTiming'))}>
        <SelectField
          options={OPD_TIMINGS}
          value={site.opdTiming}
          onChange={(next) => updateSite(index, { opdTiming: next })}
          placeholder="Select an option"
          title={sheetTitle('OPD Timing')}
          invalid={Boolean(err(key('opdTiming')))}
          searchable={false}
        />
      </Field>,
      <Field
        key="bestVisitingTime"
        name={key('bestVisitingTime')}
        label="Best Visiting Time"
        required
        error={err(key('bestVisitingTime'))}
      >
        <SelectField
          options={BEST_VISITING_TIMES}
          value={site.bestVisitingTime}
          onChange={(next) => updateSite(index, { bestVisitingTime: next })}
          placeholder="Select an option"
          title={sheetTitle('Best Visiting Time')}
          invalid={Boolean(err(key('bestVisitingTime')))}
          searchable
        />
      </Field>,
      <Field
        key="appointmentSystem"
        name={key('appointmentSystem')}
        label="Appointment System"
        required
        error={err(key('appointmentSystem'))}
      >
        <ChoiceChips
          options={APPOINTMENT_SYSTEMS}
          value={site.appointmentSystem}
          onChange={(next) => updateSite(index, { appointmentSystem: next })}
          invalid={Boolean(err(key('appointmentSystem')))}
        />
      </Field>,
    ];
  };

  /** "Hospital · Speciality", for a collapsed location card's header. */
  const siteSummary = (index: number) =>
    [sites[index].hospital.trim(), sites[index].speciality].filter(Boolean).join(' · ');

  const siteHasErrors = (index: number) =>
    Object.keys(errors).some((key) => siteIndexOf(key) === index);

  // ---- steps ----------------------------------------------------------------

  const renderStep = () => {
    switch (current.id) {
      case 'pmdc':
        return (
          <SectionCard>
            <Field name="pmdcNumber" label="PMDC Number" required error={err('pmdcNumber')}>
              <ReadOnlyValue value={pmdc} />
            </Field>
            {pmdcMessage ? <Text style={styles.errorText}>{pmdcMessage}</Text> : null}
            {verifying ? <Text style={styles.hint}>Verifying registration…</Text> : null}
            <FieldRow>
              <Field label="PMDC Status" inRow>
                <ReadOnlyValue value={form.pmdcStatus} />
              </Field>
              <Field label="Doctor Name" inRow>
                <ReadOnlyValue value={formatDoctorName(form.doctorName)} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Father's Name" inRow>
                <ReadOnlyValue value={form.fatherName} />
              </Field>
              <Field label="PMDC Issue Date" inRow>
                <ReadOnlyValue value={form.issueDate} />
              </Field>
            </FieldRow>
            <Field
              name="visitingCardUrl"
              label="Visiting Card"
              required
              help="Capture the visiting card with the camera — required to continue."
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
            <Field name="religion" label="Religion" required error={err('religion')}>
              <ChoiceChips
                options={RELIGIONS}
                value={form.religion}
                onChange={(next) => update('religion', next)}
                invalid={Boolean(err('religion'))}
              />
            </Field>
            <FieldRow forceRow>
              <Field name="age" label="Age" required inRow error={err('age')}>
                <TextField
                  value={form.age}
                  onChangeText={(next) => update('age', numeric(next, 3))}
                  placeholder="Years"
                  keyboardType="number-pad"
                  maxLength={3}
                  invalid={Boolean(err('age'))}
                />
              </Field>
              <Field name="gender" label="Gender" required inRow error={err('gender')}>
                <ChoiceChips
                  options={GENDERS}
                  value={form.gender}
                  onChange={(next) => update('gender', next)}
                  invalid={Boolean(err('gender'))}
                  compact
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field name="cellNo" label="Cell No" required inRow error={err('cellNo')}>
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
                name="whatsappNo"
                label="WhatsApp No"
                required
                inRow
                note="Change if WhatsApp is different"
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
            </FieldRow>
            <Field
              name="digitalComfortLevel"
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
              name="practiceLocations"
              label="No. of Practice Locations"
              required
              help={FIELD_HELP.practiceLocations}
              error={err('practiceLocations')}
            >
              <TextField
                value={form.practiceLocations}
                onChangeText={setPracticeLocations}
                placeholder="1 or more"
                keyboardType="number-pad"
                invalid={Boolean(err('practiceLocations'))}
              />
            </Field>
            <Field
              name="practiceType"
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
        // DINFO-FR-011: one card per location, stacked on every screen size.
        return sites.map((_, index) => (
          <LocationCard
            key={index}
            index={index}
            summary={siteSummary(index)}
            open={openSites.has(index)}
            onToggle={() => toggleSite(index)}
            hasErrors={siteHasErrors(index)}
          >
            {siteFields(index)}
          </LocationCard>
        ));

      case 'commercial':
        return (
          <SectionCard>
            <FieldRow>
              <Field
                name="innovationAdoption"
                label="Innovation & Medicine Adoption"
                required
                inRow
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
              <Field
                name="accessType"
                label="Access Type"
                required
                inRow
                help={FIELD_HELP.accessType}
                error={err('accessType')}
              >
                <ChoiceChips
                  options={ACCESS_TYPES}
                  value={form.accessType}
                  onChange={(next) => update('accessType', next)}
                  invalid={Boolean(err('accessType'))}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field
                name="preferredInteractionStyle"
                label="Preferred Interaction Style"
                required
                inRow
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
              <Field
                name="rxStatus"
                label="TSCL Prescriber"
                required
                inRow
                help={FIELD_HELP.rxStatus}
                error={err('rxStatus')}
              >
                <ChoiceChips
                  options={RX_STATUSES}
                  value={form.rxStatus}
                  onChange={(next) => update('rxStatus', next)}
                  invalid={Boolean(err('rxStatus'))}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field
                name="rxPatterns"
                label="Rx Patterns"
                required
                inRow
                help={FIELD_HELP.rxPatterns}
                error={err('rxPatterns')}
              >
                <ChoiceChips
                  options={RX_PATTERNS}
                  value={form.rxPatterns}
                  onChange={(next) => update('rxPatterns', next)}
                  invalid={Boolean(err('rxPatterns'))}
                />
              </Field>
              <Field
                name="pharmacyOwnership"
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
            <Field
              name="otherCompanyPrescribers"
              label="Other Company Prescriber"
              required
              error={err('otherCompanyPrescribers')}
            >
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

      case 'review': {
        // What would stop Save, listed up front, each with a way to fix it.
        const problems = stepsWithProblems();
        return (
          <>
          {problems.length ? (
            <View style={styles.problems}>
              <Text style={styles.problemsTitle}>
                Not ready to save — fix these first:
              </Text>
              {problems.map((row) => (
                <View key={row.entry.id} style={styles.problemRow}>
                  <Text style={styles.problemText}>
                    Step {row.index + 1} · {row.entry.title} — {row.count}{' '}
                    {row.count === 1 ? 'field' : 'fields'}
                  </Text>
                  <AppButton
                    label="Fix"
                    variant="outline"
                    onPress={() => goToStepErrors(row.index)}
                    style={styles.problemButton}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {/* Searle's review card: the key facts, one line each. */}
          <SectionCard>
            <View>
              <DetailRow label="Name" value={formatDoctorName(form.doctorName)} />
              <DetailRow
                label="PMDC"
                value={form.pmdcStatus ? `${form.pmdcNumber} (${form.pmdcStatus})` : form.pmdcNumber}
              />
              <DetailRow label="Visiting Card" value={form.visitingCardUrl ? 'Captured' : 'Missing'} />
              <DetailRow label="Gender" value={form.gender} />
              <DetailRow label="Age" value={form.age} />
              <DetailRow label="Cell No" value={form.cellNo} />
              <DetailRow label="Practice Type" value={form.practiceType} />
              {/* DINFO-FR-012: every location, in order. */}
              {sites.map((site, index) => (
                <DetailRow
                  key={index}
                  label={`Location ${index + 1}`}
                  value={[
                    site.speciality,
                    [site.hospital.trim(), site.city].filter(Boolean).join(', '),
                    site.bestVisitingTime,
                    site.appointmentSystem,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
              <DetailRow label="TSCL Prescriber" value={form.rxStatus} />
              <DetailRow
                label="Other Company Prescriber"
                value={filledShares(form.otherCompanyPrescribers)
                  .map((row) => `${row.company} – ${row.percent}%`)
                  .join('; ')}
              />
            </View>
          </SectionCard>
          </>
        );
      }
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
      {/* Searle's sticky header: stepper, then the doctor banner (or, on the
          PMDC step, the step hint). */}
      <View style={styles.stickyHeader}>
        <FormStepper titles={STEPS.map((entry) => entry.title)} current={step} />
        {current.id !== 'pmdc' && form.doctorName ? (
          <RecordBanner
            name={formatDoctorName(form.doctorName)}
            codeLabel="PMDC"
            code={form.pmdcNumber}
            description={current.description}
          />
        ) : (
          <Text style={styles.stepDescription}>
            {current.id === 'pmdc' ? PMDC_STEP_HINT : current.description}
          </Text>
        )}
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <FieldRegistryProvider value={registerField}>
          <View ref={contentRef} collapsable={false} style={styles.stack}>
            {renderStep()}
          </View>
        </FieldRegistryProvider>
      </KeyboardAwareScrollView>

      {submitMessage ? (
        <View style={styles.submitMessage}>
          <Text style={styles.submitMessageText}>{submitMessage}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <AppButton
          label={step === 0 ? 'Change Doctor' : 'Back'}
          variant="secondary"
          onPress={back}
          style={styles.footerButton}
        />
        {current.id === 'review' && queuedError ? (
          // Queued but refused by the server: the form is done either way.
          <AppButton label="Done" onPress={onSaved} style={styles.footerButton} />
        ) : current.id === 'review' ? (
          <AppButton
            label={save.isPending ? 'Saving to server…' : 'Save Doctor'}
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
  // Raised bar over the step, like the list screens' sticky header.
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
  stepDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 16,
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
  problems: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: 12,
  },
  problemsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.danger,
  },
  problemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  problemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  problemButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  submitMessage: {
    borderTopWidth: 1,
    borderTopColor: Colors.danger,
    backgroundColor: Colors.dangerBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  submitMessageText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.danger,
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
