/**
 * Pakistani mobile numbers, formatted as +92-333-3029554.
 *
 * The rep types digits and the field fills in the rest, so every contact number
 * in patient_log lands in one shape — searching or dialling a log where some
 * rows are "03332029554" and others "+92 333 2029554" is needlessly painful.
 */

/** +92 plus a 10-digit national number, e.g. 333 3029554. */
const NATIONAL_DIGITS = 10;
const OPERATOR_DIGITS = 3;

/** The formatted result is at most this long — patient_log.contact_number is varchar(20). */
export const PHONE_MAX_LENGTH = '+92-333-3029554'.length;

export const PHONE_PLACEHOLDER = '+92-3XX-XXXXXXX';

/**
 * Reduce anything the rep types (or pastes) to the 10 national digits.
 *
 * Handles the three ways a Pakistani number is normally written: with the
 * country code (+92 / 0092 / 92...), with a trunk zero (0333...), or bare
 * (333...). Anything beyond 10 digits is dropped rather than wrapped, so a
 * mistyped extra keystroke can't silently shift the whole number.
 *
 * A leading 92 is stripped UNCONDITIONALLY, which is what makes this safe to
 * run over its own output — and it is, on every keystroke, because the field
 * holds the formatted value. Every Pakistani mobile number is 3xx, so no
 * national number can legitimately begin 92 and nothing valid is lost. Guarding
 * the strip on length instead looks safer and is not: "+92-333-3" re-parses to
 * "923333", which is short, so the 92 would survive and the number would rot
 * into "+92-923-333" as it was typed.
 */
export function toNationalDigits(input: string): string {
  let digits = String(input ?? '').replace(/\D/g, '');

  // 0092... -> 92...
  if (digits.startsWith('00')) digits = digits.slice(2);
  // 92333... -> 333...
  if (digits.startsWith('92')) digits = digits.slice(2);
  // 0333... -> 333...
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');

  return digits.slice(0, NATIONAL_DIGITS);
}

/**
 * Format for display as the rep types: '' -> '', '3' -> '+92-3',
 * '3333' -> '+92-333-3', '3333029554' -> '+92-333-3029554'.
 *
 * An empty input stays empty rather than becoming a bare '+92-', so the
 * placeholder still shows and a rep who records no number saves NULL.
 */
export function formatPakistaniMobile(input: string): string {
  const digits = toNationalDigits(input);
  if (digits.length === 0) return '';

  const operator = digits.slice(0, OPERATOR_DIGITS);
  const subscriber = digits.slice(OPERATOR_DIGITS);

  return subscriber.length > 0
    ? `+92-${operator}-${subscriber}`
    : `+92-${operator}`;
}

/** True once a full 10-digit national number has been entered. */
export function isCompletePakistaniMobile(input: string): boolean {
  return toNationalDigits(input).length === NATIONAL_DIGITS;
}
