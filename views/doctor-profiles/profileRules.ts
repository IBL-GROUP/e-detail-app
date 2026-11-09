import type {
  CompanyShare,
  DoctorProfileFields,
  DoctorProfileRow,
  PracticeSite,
} from '@/api/doctorProfiles';

/**
 * The Doctor Information Gathering BRD, as the form needs it: the fixed
 * dropdown lists (BRD section 6), the field hints, and the field-level rules.
 *
 * Ported as-is from the Searle "One Force Doctors" app
 * (src/constants/masterData.ts, src/constants/doctorFieldHelp.ts,
 * src/utils/validation.ts) so a profile captured here reads exactly like one
 * captured there — both land in the same doctors_info table. Cities, hospitals
 * and pharma companies are NOT here: they come from /doctor-profiles/master.
 */

export const DOCTOR_SPECIALITIES = [
  'ANESTHESIA',
  'CARDIOLOGIST',
  'CHEST SPECIALIST',
  'DENTIST',
  'DERMATOLOGIST',
  'DIABETOLOGIST',
  'ENT SPECIALIST',
  'GASTROENTEROLOGIST',
  'GENERAL PRACTITIONER',
  'GYNECOLOGIST',
  'NEPHROLOGIST',
  'NEURO PHYSICIAN',
  'NEURO SURGEON',
  'ONCOLOGIST',
  'ORTHOPEDICIAN',
  'PAEDIATRICIAN',
  'PHYSICIAN',
  'PSYCHIATRIST',
  'SURGEON',
  'UROLOGIST',
];

/**
 * The Searle app's bundled city list — used only until /doctor-profiles/master
 * has been fetched once, so the city picker is never empty on a first launch
 * with no signal.
 */
export const FALLBACK_CITIES = [
  'Abbottabad', 'Bahawalpur', 'Faisalabad', 'Gujranwala', 'Hyderabad', 'Islamabad',
  'Karachi', 'Lahore', 'Mardan', 'Multan', 'Muzaffarabad', 'Peshawar', 'Quetta',
  'Rawalpindi', 'Sahiwal', 'Sargodha', 'Sialkot', 'Sukkur',
];

export const RELIGIONS = ['Muslim', 'Non-Muslim'];
export const GENDERS = ['Male', 'Female'];
export const DIGITAL_COMFORT_LEVELS = ['Low', 'Medium', 'High'];
/** No. of Practice Locations: a typed whole number, starting at 1, no upper limit (DINFO-BR-009). */
export const MIN_PRACTICE_LOCATIONS = 1;
export const DEFAULT_PRACTICE_LOCATIONS = '1';
export const PRACTICE_TYPES = ['Private', 'Hospital', 'Both'];
export const ADOPTION_LEVELS = ['Early Adopter', 'Mid Adopter', 'Late Adopter'];
export const ACCESS_TYPES = ['Easy', 'Moderate', 'Restricted'];
export const INTERACTION_STYLES = ['Academic', 'Business', 'Relationship'];
export const RX_STATUSES = ['Frequent', 'Occasional', 'Non Prescriber'];
export const RX_PATTERNS = ['Generic', 'Specific'];
export const PHARMACY_OWNERSHIP = ['Yes', 'No'];
export const SESSION_TIMES = ['Morning', 'Evening'];
export const OPD_TIMINGS = [
  '9 AM - 12 PM',
  '12 PM - 3 PM',
  '3 PM - 6 PM',
  '6 PM - 9 PM',
  '9 PM - 12 AM',
];
export const APPOINTMENT_SYSTEMS = ['Manual', 'Computerized'];

/** 30-minute visiting windows round the clock, starting at 9:00 AM. */
export const BEST_VISITING_TIMES = (() => {
  const DAY = 24 * 60;
  const START = 9 * 60;
  const formatClock = (totalMinutes: number) => {
    const normalized = ((totalMinutes % DAY) + DAY) % DAY;
    const hour24 = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const period = hour24 < 12 ? 'AM' : 'PM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  };

  const slots: string[] = [];
  for (let offset = 0; offset < DAY; offset += 30) {
    const start = (START + offset) % DAY;
    slots.push(`${formatClock(start)}–${formatClock(start + 30)}`);
  }
  return slots;
})();

/** Short hints under the labels that aren't self-explanatory. */
export const FIELD_HELP = {
  digitalComfortLevel: 'Comfort with apps, WhatsApp, and e‑detailing.',
  innovationAdoption: 'How quickly doctor adopts new medicines.',
  accessType: 'How easy it is to meet this doctor.',
  preferredInteractionStyle: 'Preferred engagement with field force.',
  rxStatus: 'How often doctor prescribes TSCL.',
  rxPatterns: 'Usually written by generic or brand?',
  pharmacyOwnership: 'Owns or co-owns a pharmacy?',
  practiceType: 'Main practice setting.',
  practiceLocations: 'The next step asks for the details of each location.',
  bestVisitingTime: 'Best time for a field visit at this practice.',
  appointmentSystem: 'Manual booking or a computerized appointment system.',
  session: 'Whether the session is mainly morning or evening.',
  hospital: 'Full name only — no short forms (e.g. AKUH).',
} as const;

/** The six steps, in the Searle app's order, with its step copy. */
export const STEPS = [
  {
    id: 'pmdc',
    title: 'PMDC Verification',
    description: "Verify the registration number to auto-fill the practitioner's identity.",
  },
  {
    id: 'personal',
    title: 'Personal Information',
    description: 'Personal and contact details of the practitioner.',
  },
  {
    id: 'professional',
    title: 'Professional Information',
    description: 'Number of practice locations and practice type.',
  },
  {
    id: 'practice',
    title: 'Practice Locations',
    description: 'The details of every practice location, one card each.',
  },
  {
    id: 'commercial',
    title: 'Commercial & Accessibility',
    description: 'Prescribing behavior, innovation adoption and access.',
  },
  {
    id: 'review',
    title: 'Review & Submit',
    description: 'Confirm the practitioner profile before saving.',
  },
] as const;

/** Shown on the PMDC step, where the banner isn't (Searle's copy). */
export const PMDC_STEP_HINT =
  'Registration details loaded from your assigned list. Review and continue.';

export type StepId = (typeof STEPS)[number]['id'];

/** One practice location's fields, in Searle's order (DINFO-FR-011). */
export const SITE_FIELDS = [
  'speciality', 'city', 'hospital', 'session', 'fee', 'avgTime', 'patientsPerDay',
  'opdTiming', 'bestVisitingTime', 'appointmentSystem',
] as const satisfies readonly (keyof PracticeSite)[];

export type SiteField = (typeof SITE_FIELDS)[number];

/** The form/error key of one location's field: `practiceSites.<index>.<field>`. */
export const siteKey = (index: number, field: SiteField) => `practiceSites.${index}.${field}`;

/** The location index a `practiceSites.<index>.<field>` key belongs to, else null. */
export const siteIndexOf = (key: string) => {
  const match = /^practiceSites\.(\d+)\./.exec(key);
  return match ? Number(match[1]) : null;
};

/**
 * Which fields each step owns — errors are only shown for the current step.
 * The practice step's fields depend on the number of locations: see
 * siteFieldKeys.
 */
export const STEP_FIELDS: Record<StepId, string[]> = {
  pmdc: ['pmdcNumber', 'visitingCardUrl'],
  personal: ['religion', 'age', 'gender', 'cellNo', 'whatsappNo', 'digitalComfortLevel'],
  professional: ['practiceLocations', 'practiceType'],
  practice: [],
  commercial: [
    'innovationAdoption', 'accessType', 'preferredInteractionStyle', 'rxStatus',
    'rxPatterns', 'pharmacyOwnership', 'otherCompanyPrescribers',
  ],
  review: [],
};

/** Every field key of the first `count` locations, location by location. */
export const siteFieldKeys = (count: number) =>
  Array.from({ length: count }, (_, index) => SITE_FIELDS.map((field) => siteKey(index, field))).flat();

export const EMPTY_SITE: PracticeSite = {
  speciality: '', city: '', hospital: '', session: '', fee: '', avgTime: '',
  patientsPerDay: '', opdTiming: '', bestVisitingTime: '', appointmentSystem: '',
};

/** Mobile numbers are stored the Searle way: 11 digits starting 03. */
export const PK_MOBILE_PREFIX = '03';

export const EMPTY_PROFILE: DoctorProfileFields = {
  pmdcNumber: '', pmdcStatus: '', doctorName: '', fatherName: '', issueDate: '',
  religion: '', age: '', gender: '', cellNo: PK_MOBILE_PREFIX, whatsappNo: PK_MOBILE_PREFIX,
  digitalComfortLevel: '',
  primarySpeciality: '', secondarySpeciality: '', practiceLocations: DEFAULT_PRACTICE_LOCATIONS, practiceType: '',
  innovationAdoption: '', accessType: '', preferredInteractionStyle: '', rxStatus: '',
  rxPatterns: '', pharmacyOwnership: '',
  otherCompanyPrescribers: [],
  visitingCardUrl: '',
  primaryHospital: '', primaryCity: '', primarySession: '', primaryFee: '', primaryAvgTime: '',
  primaryPatientsPerDay: '', primaryOpdTiming: '', primaryBestVisitingTime: '',
  primaryAppointmentSystem: '',
  secondaryHospital: '', secondaryCity: '', secondarySession: '', secondaryFee: '',
  secondaryAvgTime: '', secondaryPatientsPerDay: '', secondaryOpdTiming: '',
  secondaryBestVisitingTime: '', secondaryAppointmentSystem: '',
  practiceSites: [EMPTY_SITE],
};

/** Per the BRD the name always carries "DR." (DOC-BR-007). */
export function formatDoctorName(name: unknown): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^(dr\.?)\s+/i, '').trim();
  return withoutPrefix ? `DR. ${withoutPrefix}` : '';
}

/** Master status → Active / Inactive, as the server maps it (DOC-BR-008). */
export function normalizePmdcStatus(raw: unknown): string {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value) return '';
  return value === 'Y' || value === 'ACTIVE' ? 'Active' : 'Inactive';
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/** Pakistan mobile as typed: always starts with 03, at most 11 digits. */
export function formatPkMobile(raw: string): string {
  let digits = digitsOnly(raw);
  if (!digits.length) return PK_MOBILE_PREFIX;
  if (!digits.startsWith('03')) {
    if (digits.startsWith('3')) digits = `0${digits}`;
    else if (digits.startsWith('0')) digits = `03${digits.slice(1)}`;
    else digits = `03${digits}`;
  }
  return digits.slice(0, 11);
}

/** A practice-location count that is a whole number of at least 1 (DINFO-BR-009). */
export const isValidPracticeLocations = (value: string) =>
  /^\d+$/.test(value) && Number(value) >= MIN_PRACTICE_LOCATIONS;

/**
 * N, the number of locations Step 4 shows (DINFO-FR-011). At least 1, so
 * Location 1 always exists, also while Step 3 holds an invalid count.
 */
export const practiceLocationCount = (practiceLocations: string) =>
  isValidPracticeLocations(practiceLocations) ? Number(practiceLocations) : 1;

/**
 * The locations that are shown, validated and sent: the first N, padded with
 * empty ones. Locations kept beyond N stay in the form, hidden (DINFO-BR-011).
 */
export const visibleSites = (form: Pick<DoctorProfileFields, 'practiceLocations' | 'practiceSites'>) =>
  Array.from(
    { length: practiceLocationCount(form.practiceLocations) },
    (_, index) => form.practiceSites?.[index] ?? EMPTY_SITE,
  );

const flatSite = (row: Record<string, unknown>, side: 'primary' | 'secondary'): PracticeSite => {
  const site = { ...EMPTY_SITE };
  for (const field of SITE_FIELDS) {
    const value = row[`${side}${field.charAt(0).toUpperCase()}${field.slice(1)}`];
    site[field] = value == null ? '' : String(value);
  }
  return site;
};

/**
 * A profile's locations (DINFO-FR-012, DINFO-DATA-004): its `practiceSites`,
 * or — for a draft, queued profile or server row from before this change, or
 * from the Searle app — its primary practice, plus the secondary one when
 * there are 2 or more locations or any secondary field is filled.
 */
export function sitesOf(row: Partial<DoctorProfileFields> | DoctorProfileRow): PracticeSite[] {
  const sites = (row as { practiceSites?: unknown }).practiceSites;
  if (Array.isArray(sites) && sites.length) {
    return sites.map((site) => {
      const clean = { ...EMPTY_SITE };
      for (const field of SITE_FIELDS) {
        const value = (site as Record<string, unknown>)?.[field];
        clean[field] = value == null ? '' : String(value);
      }
      return clean;
    });
  }
  const flat = row as Record<string, unknown>;
  const primary = flatSite(flat, 'primary');
  const secondary = flatSite(flat, 'secondary');
  const count = Number(String(flat.practiceLocations ?? '').trim());
  const hasSecondary = count >= 2 || SITE_FIELDS.some((field) => secondary[field].trim());
  return hasSecondary ? [primary, secondary] : [primary];
}

/**
 * DINFO-FR-012: average time as shown — "{n} min". A value in the admin
 * console's older "{n} Mins" form ("15 Mins") shows as "15 min"; any other
 * text is shown as it is; blank stays blank.
 */
export function formatAvgTime(value: string): string {
  const text = String(value ?? '').trim();
  const minutes = /^(\d+)\s*(mins?\.?)?$/i.exec(text);
  return minutes ? `${minutes[1]} min` : text;
}

const siteKeyPart = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const isRequired = (value?: string | null) => String(value ?? '').trim().length > 0;
const isPhoneNumber = (value: string) => /^\d{11}$/.test(digitsOnly(value));
/** PMDC numbers look like "1478-S": 3-20 letters, digits and dashes. */
export const isPmdc = (value: string) => /^[A-Za-z0-9-]{3,20}$/.test(value);
const isNonNegativeNumeric = (value: string) =>
  /^\d+(\.\d+)?$/.test(value) && Number(value) >= 0;

const REQUIRED_MSG = 'This field is required';

/** Validate the whole profile against the BRD's field-level rules. */
export function validateProfile(form: DoctorProfileFields): Record<string, string> {
  const errors: Record<string, string> = {};
  const req = (key: keyof DoctorProfileFields) => {
    if (!isRequired(form[key] as string)) errors[key] = REQUIRED_MSG;
  };

  // The PMDC lookup must have completed before anything else counts.
  if (!isRequired(form.doctorName)) {
    errors.pmdcNumber =
      'Enter a valid PMDC number and verify it to fetch the practitioner details first.';
  } else if (!isPmdc(form.pmdcNumber || '')) {
    errors.pmdcNumber = 'Enter a valid PMDC number.';
  }

  req('visitingCardUrl');

  (
    [
      'religion', 'gender', 'digitalComfortLevel', 'practiceLocations',
      'practiceType', 'innovationAdoption', 'accessType', 'preferredInteractionStyle',
      'rxStatus', 'rxPatterns', 'pharmacyOwnership',
    ] as const
  ).forEach(req);

  // DINFO-BR-009
  if (isRequired(form.practiceLocations) && !isValidPracticeLocations(form.practiceLocations)) {
    errors.practiceLocations = `Enter a number of at least ${MIN_PRACTICE_LOCATIONS}.`;
  }
  if (!isNonNegativeNumeric(form.age || '')) errors.age = 'Enter a valid non-negative age.';
  if (!isRequired(form.cellNo)) errors.cellNo = REQUIRED_MSG;
  else if (!isPhoneNumber(form.cellNo)) errors.cellNo = 'Cell number must be exactly 11 digits.';
  if (!isRequired(form.whatsappNo)) errors.whatsappNo = REQUIRED_MSG;
  else if (!isPhoneNumber(form.whatsappNo)) {
    errors.whatsappNo = 'WhatsApp number must be exactly 11 digits.';
  }
  const shareError = validateShares(form.otherCompanyPrescribers);
  if (shareError) errors.otherCompanyPrescribers = shareError;

  Object.assign(errors, validateSites(visibleSites(form)));
  return errors;
}

/**
 * DINFO-BR-010: every shown location needs the primary practice's fields.
 * DINFO-BR-013: no speciality twice at one hospital (same city), checked on
 * the later location. Keys are siteKey(index, field).
 */
export function validateSites(sites: PracticeSite[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const required: SiteField[] = [
    'speciality', 'city', 'hospital', 'session', 'avgTime', 'opdTiming',
    'bestVisitingTime', 'appointmentSystem',
  ];

  sites.forEach((site, index) => {
    for (const field of required) {
      if (!isRequired(site[field])) errors[siteKey(index, field)] = REQUIRED_MSG;
    }
    if (!isNonNegativeNumeric(site.fee || '')) {
      errors[siteKey(index, 'fee')] = 'Enter a valid non-negative fee.';
    }
    if (!isNonNegativeNumeric(site.avgTime || '')) {
      errors[siteKey(index, 'avgTime')] = 'Enter avg time in minutes (numbers only).';
    }
    if (!isNonNegativeNumeric(site.patientsPerDay || '')) {
      errors[siteKey(index, 'patientsPerDay')] = 'Enter a valid non-negative number.';
    }
  });
  return { ...errors, ...siteClashes(sites) };
}

/**
 * DINFO-BR-013: the same speciality at the same hospital (same city) twice,
 * reported on the later location's speciality. Also run as soon as one of
 * those fields is chosen, not only on Next.
 */
export function siteClashes(sites: PracticeSite[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Map<string, number>();
  sites.forEach((site, index) => {
    if (!isRequired(site.city) || !isRequired(site.hospital) || !isRequired(site.speciality)) return;
    const key = [site.city, site.hospital, site.speciality].map(siteKeyPart).join('\u0000');
    const first = seen.get(key);
    if (first == null) {
      seen.set(key, index);
    } else {
      errors[siteKey(index, 'speciality')] =
        `${site.speciality} is already entered for ${site.hospital.trim()} at Location ${first + 1}.`;
    }
  });
  return errors;
}

/**
 * DINFO-DATA-003: what is sent for the locations — practiceSites (the first N,
 * hospital names trimmed), practiceLocations = N, and primary* / secondary*
 * mirroring locations 1 and 2 for a backend without practiceSites.
 */
export function sitesPayload(form: DoctorProfileFields) {
  const sites = visibleSites(form).map((site) => ({
    ...site,
    hospital: site.hospital.trim().replace(/\s+/g, ' '),
  }));
  const mirror: Record<string, string> = {};
  for (const field of SITE_FIELDS) {
    const suffix = `${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    mirror[`primary${suffix}`] = sites[0]?.[field] ?? '';
    mirror[`secondary${suffix}`] = sites[1]?.[field] ?? '';
  }
  return {
    ...(mirror as Pick<
      DoctorProfileFields,
      Extract<keyof DoctorProfileFields, `primary${string}` | `secondary${string}`>
    >),
    practiceLocations: String(sites.length),
    practiceSites: sites,
  };
}

/** The rows the rep actually filled in — blank placeholder rows dropped. */
export function filledShares(shares: CompanyShare[]): CompanyShare[] {
  return (shares ?? []).filter(
    (row) => (row?.company || '').trim() || Number(row?.percent) > 0,
  );
}

/** At least one company, each named once with a share > 0, totalling 100%. */
function validateShares(shares: CompanyShare[]): string | null {
  const filled = filledShares(shares);
  if (!filled.length) return 'Add at least one company with a percentage.';

  const names = filled.map((row) => (row.company || '').trim()).filter(Boolean);
  if (names.length !== filled.length) return 'Enter a company name for every percentage row.';
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    return 'Each company can only be entered once.';
  }
  if (filled.some((row) => !(Number(row.percent) > 0))) {
    return 'Each company percentage must be greater than 0.';
  }
  const total = filled.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  if (total !== 100) return `Percentages must total 100% (currently ${total}%).`;
  return null;
}
