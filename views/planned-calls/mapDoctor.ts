import type { DoctorDataRow } from '@/api/doctor';
import type { Doctor } from './DoctorCard';

/** Shown wherever the `doctors` row has no value for a field. */
export const DASH = '-';

function asText(value: unknown, fallback: string = DASH) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

/**
 * The rep's last recorded call for this doctor (call_tracking), as a readable
 * date. A doctor they have never called shows a dash.
 */
export function formatLastVisit(value?: string | null): string {
  if (!value) return DASH;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return asText(value);

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * One `doctors` row → the shape the doctor list + detail screens render. Every
 * field falls back to a dash when the record has no value, so the UI never shows
 * an invented placeholder.
 */
export function mapDoctorRow(row: DoctorDataRow): Doctor {
  return {
    id: String(row.DOCTORID ?? ''),
    name: asText(row.DOCTORNAME, 'Unknown Doctor'),
    specialty: asText(
      row.SpecialtyByCommercial,
      asText(row.SpecialtyByIkon, 'Unknown Specialty'),
    ),
    specialtyId: row.SpecialtyId,
    // `doctors` has no hospital column yet — always a dash until one exists.
    hospital: DASH,
    address: asText(row.ClinicAddress),
    city: asText(row.CITY),
    lastVisit: formatLastVisit(row.LastVisit),
    doctorClass: asText(row.DoctorClass),
    pmdc: asText(row.PMDC),
    teamId: row.TEAMID,
    // Monthly coverage: how many of the class's required calls are done.
    visitCount: row.VisitCount ?? 0,
    maxVisits: row.MaxVisitCount ?? null,
    visitStatus: row.VisitStatus === 'completed' ? 'completed' : 'in_progress',
    visitsChamber: row.VisitsChamber ?? 0,
    visitsGroup: row.VisitsGroup ?? 0,
    visitsParking: row.VisitsParking ?? 0,
    visitsJoin: row.VisitsJoin ?? 0,
  };
}

export function mapDoctorRows(rows: DoctorDataRow[]): Doctor[] {
  return rows.map(mapDoctorRow);
}
