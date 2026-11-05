import { Children, createContext, useContext, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppBottomSheetSelect } from '@/components/ui/AppBottomSheetSelect';
import { Colors } from '@/constants/theme';

/**
 * The doctor-profile form's building blocks — the patient form's look (labels,
 * 44px inputs on #F8FAFC, red border and hint on error, chip rows) factored out,
 * because this form has six steps and forty fields rather than one sheet.
 *
 * The LAYOUT follows the Searle app (its Stepper, FormRecordBanner, FieldRow
 * and PracticeDualColumns); the look is this app's.
 */

/** Searle's tablet breakpoint: from here, paired fields sit side by side. */
export const TABLET_MIN_WIDTH = 700;

export const useIsTablet = () => useWindowDimensions().width >= TABLET_MIN_WIDTH;

/**
 * Lets a Field report where it is, so the form can scroll to the first field
 * with an error (as the Searle form does) instead of to the top.
 */
const FieldRegistry = createContext<((name: string, node: View | null) => void) | null>(null);
export const FieldRegistryProvider = FieldRegistry.Provider;

/**
 * One labelled field. Pass `name` (the form key) so an error can scroll to it,
 * and `inRow` for a field sharing a horizontal row.
 */
export function Field({
  name,
  label,
  required = false,
  inRow = false,
  help,
  note,
  error,
  children,
}: {
  name?: string;
  label: string;
  required?: boolean;
  inRow?: boolean;
  /** A short hint under the label, for the fields that need explaining. */
  help?: string;
  /** A hint under the control, so it doesn't push the control down in a row. */
  note?: string;
  /** Shown in red under the control. */
  error?: string;
  children: ReactNode;
}) {
  const register = useContext(FieldRegistry);
  return (
    <View
      ref={name && register ? (node) => register(name, node) : undefined}
      collapsable={false}
      style={[styles.field, inRow && styles.fieldInRow]}
    >
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {children}
      {note ? <Text style={styles.help}>{note}</Text> : null}
      {error ? <Text style={styles.errorHint}>{error}</Text> : null}
    </View>
  );
}

/**
 * A pair of fields — Searle's FieldRow: side by side on a tablet, stacked on a
 * phone. `forceRow` keeps them side by side on a phone too (Age | Gender).
 */
export function FieldRow({ children, forceRow = false }: { children: ReactNode; forceRow?: boolean }) {
  const isTablet = useIsTablet();
  const items = Children.toArray(children).filter(Boolean);
  if (items.length < 2 || !(forceRow || isTablet)) {
    return <View style={styles.stack}>{items}</View>;
  }
  return (
    <View style={styles.row}>
      {items.map((child, index) => (
        <View key={index} style={styles.rowCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** A plain text input with the form's styling. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  invalid = false,
  editable = true,
  keyboardType,
  maxLength,
  autoCapitalize,
}: {
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      editable={editable}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      style={[styles.input, !editable && styles.inputReadOnly, invalid && styles.inputError]}
    />
  );
}

/** A read-only value from the PMDC register, shown like a locked input. */
export function ReadOnlyValue({ value }: { value: string }) {
  return (
    <View style={[styles.input, styles.inputReadOnly, styles.readOnlyBox]}>
      <Text style={[styles.readOnlyText, !value && styles.readOnlyEmpty]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

/**
 * The radio groups of the Searle form, as the patient form's Oral / PFS chips.
 * Like a radio, tapping the active chip keeps it — a second tap used to clear
 * the answer, which read as "my selection wasn't saved". `compact` for the
 * narrow Primary | Secondary columns.
 */
export function ChoiceChips({
  options,
  value,
  onChange,
  invalid = false,
  compact = false,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => {
              if (!active) onChange(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              compact && styles.chipCompact,
              active && styles.chipActive,
              invalid && !value && styles.chipInvalid,
            ]}
          >
            <Text
              style={[styles.chipText, compact && styles.chipTextCompact, active && styles.chipTextActive]}
              numberOfLines={1}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A dropdown — the app's bottom-sheet select, with the form's error border. */
export function SelectField({
  options,
  value,
  onChange,
  placeholder,
  title,
  invalid = false,
  searchable,
  allowCustom = false,
  searchPlaceholder,
  emptyText = 'Nothing matches that search.',
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  title: string;
  invalid?: boolean;
  searchable?: boolean;
  /** Let the rep add what they typed in the search box (Searle's allowCustom). */
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  return (
    <AppBottomSheetSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      title={title}
      searchable={allowCustom || (searchable ?? options.length > 8)}
      searchPlaceholder={
        searchPlaceholder ?? `Search ${title.replace(/^Select /, '').toLowerCase()}`
      }
      emptyText={emptyText}
      triggerStyle={invalid ? styles.inputError : undefined}
      allowCustom={allowCustom}
    />
  );
}

/**
 * Hospital: picked from the city's hospitals, or added — as in the Searle
 * app, the rep types the name in the search box and taps "Add “…”".
 *
 * An added name is saved with the profile and the server adds it to the
 * city's hospital list when the profile lands (DOC-BR-012), so it also works
 * offline. Cities are never added: they come from the master list only.
 */
export function HospitalField({
  hospitals,
  value,
  onChange,
  city,
  title,
  invalid = false,
}: {
  hospitals: string[];
  value: string;
  onChange: (value: string) => void;
  city: string;
  /** The sheet's title — the side, beside the other practice ("Primary · Hospital"). */
  title?: string;
  invalid?: boolean;
}) {
  if (!city) {
    return <ReadOnlyValue value="Select a city first" />;
  }

  return (
    <SelectField
      options={hospitals}
      value={value}
      onChange={(picked) => onChange(picked.trim().replace(/\s+/g, ' '))}
      placeholder="Select or add hospital"
      title={title ?? `Hospitals in ${city}`}
      searchPlaceholder="Search or type a new name…"
      emptyText="No matching options — type a name above, then tap Add as new."
      invalid={invalid}
      allowCustom
    />
  );
}

/** A titled block of fields on the form's surface. */
export function SectionCard({
  title,
  icon,
  dense = false,
  children,
}: {
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Less padding, for the two practice columns on a phone. */
  dense?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, dense && styles.sectionDense]}>
      {title ? (
        <View style={styles.sectionTitleRow}>
          {icon ? <Ionicons name={icon} size={16} color={Colors.primary} /> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Searle's Stepper: "Step n of 6", the step title, and a progress bar. */
export function FormStepper({ titles, current }: { titles: readonly string[]; current: number }) {
  const total = titles.length;
  const percent = total > 0 ? ((current + 1) / total) * 100 : 0;
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperRow}>
        <Text style={styles.stepCount}>
          Step {Math.min(current + 1, total)} of {total}
        </Text>
        <Text style={styles.stepTitle} numberOfLines={2}>
          {titles[current] ?? ''}
        </Text>
      </View>
      <View style={styles.stepTrack}>
        <View style={[styles.stepFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

/**
 * Searle's FormRecordBanner: which doctor the rep is completing, always in
 * view, with the step's hint beside it.
 */
export function RecordBanner({
  name,
  codeLabel,
  code,
  description,
}: {
  name?: string;
  codeLabel: string;
  code?: string;
  description?: string;
}) {
  const desc = description?.trim();
  return (
    <View style={styles.banner} accessibilityRole="header">
      <View style={[styles.bannerRow, Boolean(desc) && styles.bannerRowWithDesc]}>
        <View style={[styles.bannerIdentity, Boolean(desc) && styles.bannerIdentityFlex]}>
          <Text style={styles.bannerName} numberOfLines={2}>
            {name?.trim() || '—'}
          </Text>
          <View style={styles.bannerCodeRow}>
            <Text style={styles.bannerCodeLabel}>{codeLabel}</Text>
            <Text style={styles.bannerCode} numberOfLines={1}>
              {code?.trim() || '—'}
            </Text>
          </View>
        </View>
        {desc ? (
          <>
            <View style={styles.bannerSeparator} />
            <Text style={styles.bannerDescription} numberOfLines={4}>
              {desc}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

/** The sticky "Primary | Secondary" heads over the two practice columns. */
export function PracticeColumnHeads() {
  return (
    <View style={styles.heads} pointerEvents="none">
      <Text style={[styles.head, styles.headPrimary]}>Primary</Text>
      <View style={styles.headRule} />
      <Text style={[styles.head, styles.headSecondary]}>Secondary</Text>
    </View>
  );
}

/**
 * Primary | Secondary practice side by side with one continuous rule between
 * (Searle's PracticeDualColumns). Laid out row by row, so a field always sits
 * level with its partner — an error or a wrapped label on one side can't push
 * the rest of that column out of line.
 */
export function PracticeDualRows({
  rows,
}: {
  rows: { key: string; primary: ReactNode; secondary: ReactNode }[];
}) {
  return (
    <View>
      {rows.map((row, index) => (
        <View key={row.key} style={styles.pairRow}>
          <View style={[styles.pairCell, index < rows.length - 1 && styles.pairCellSpaced]}>
            {row.primary}
          </View>
          <View style={styles.dualRule} />
          <View style={[styles.pairCell, index < rows.length - 1 && styles.pairCellSpaced]}>
            {row.secondary}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A label / value line in the summary cards (Searle's DetailRow). */
export function DetailRow({ label, value }: { label: string; value?: unknown }) {
  const text = String(value ?? '').trim();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{text || '—'}</Text>
    </View>
  );
}

export const formStyles = StyleSheet.create({
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
});

const styles = StyleSheet.create({
  // Content-height by design — see the patient form: a field that flexes in a
  // vertical container claims an equal share of the height.
  field: {
    gap: 6,
  },
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
  help: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: -2,
  },
  stack: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowCell: {
    flex: 1,
    minWidth: 0,
  },
  input: formStyles.input,
  inputReadOnly: {
    backgroundColor: Colors.disabledBg,
    borderColor: Colors.disabledBorder,
  },
  readOnlyBox: {
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  readOnlyEmpty: {
    color: Colors.disabledText,
  },
  inputError: formStyles.inputError,
  errorHint: formStyles.errorHint,
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 90,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  // In a half-width practice column the options sit side by side and wrap
  // only when they don't fit — as Searle's compact radio row does — so a
  // long one ("Computerized") gets its own line instead of being cut off.
  chipCompact: {
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipInvalid: {
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5B6A7F',
  },
  chipTextCompact: {
    fontSize: 12,
  },
  chipTextActive: {
    color: Colors.textOnDark,
  },
  sectionDense: {
    paddingHorizontal: 10,
  },
  // Same surface and shadow as the patient list's sticky header card.
  // (sectionDense, below, narrows it for the two practice columns.)
  section: {
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  // Stepper
  stepper: {
    gap: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepCount: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.secondary,
  },
  stepTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  stepFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  // Record banner — this app's navy, as Searle's banner is its own.
  banner: {
    borderRadius: 10,
    backgroundColor: Colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bannerRow: {
    flexDirection: 'column',
  },
  bannerRowWithDesc: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  bannerIdentity: {
    flexShrink: 0,
  },
  bannerIdentityFlex: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  bannerName: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  bannerCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  bannerCodeLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bannerCode: {
    flex: 1,
    color: Colors.textOnDark,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  bannerSeparator: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: 8,
  },
  bannerDescription: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
  },
  // Primary | Secondary
  heads: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  head: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  headPrimary: {
    color: Colors.secondary,
  },
  headSecondary: {
    color: Colors.primary,
  },
  headRule: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: Colors.textMuted,
    marginHorizontal: 8,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  pairCell: {
    flex: 1,
    minWidth: 0,
  },
  pairCellSpaced: {
    paddingBottom: 14,
  },
  dualRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: Colors.border,
    marginHorizontal: 10,
  },
  // Detail rows
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    flex: 1.6,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
});
