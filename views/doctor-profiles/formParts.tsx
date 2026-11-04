import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppBottomSheetSelect } from '@/components/ui/AppBottomSheetSelect';
import { Colors } from '@/constants/theme';

/**
 * The doctor-profile form's building blocks — the patient form's look (labels,
 * 44px inputs on #F8FAFC, red border and hint on error, chip rows) factored out,
 * because this form has six steps and forty fields rather than one sheet.
 */

/** One labelled field. Pass `inRow` for fields sharing a horizontal row. */
export function Field({
  label,
  required = false,
  inRow = false,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  inRow?: boolean;
  /** A short hint under the label, for the fields that need explaining. */
  help?: string;
  /** Shown in red under the control. */
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, inRow && styles.fieldInRow]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {children}
      {error ? <Text style={styles.errorHint}>{error}</Text> : null}
    </View>
  );
}

/** A horizontal pair (or trio) of fields. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
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
 * Tapping the active chip clears it, so "none" stays reachable.
 */
export function ChoiceChips({
  options,
  value,
  onChange,
  invalid = false,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(active ? '' : option)}
            style={[styles.chip, active && styles.chipActive, invalid && !value && styles.chipInvalid]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
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
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  title: string;
  invalid?: boolean;
  searchable?: boolean;
}) {
  return (
    <AppBottomSheetSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      title={title}
      searchable={searchable ?? options.length > 8}
      searchPlaceholder={`Search ${title.replace(/^Select /, '').toLowerCase()}`}
      emptyText="Nothing matches that search."
      triggerStyle={invalid ? styles.inputError : undefined}
    />
  );
}

const ADD_NEW = '+ Add a hospital not listed';

/**
 * Hospital: picked from the city's hospitals, or typed when it isn't there.
 *
 * A typed name is saved with the profile and the server adds it to the city's
 * hospital list when the profile lands (DOC-BR-012) — so it also works offline.
 * Cities are never typed: they come from the master list only.
 */
export function HospitalField({
  hospitals,
  value,
  onChange,
  city,
  invalid = false,
}: {
  hospitals: string[];
  value: string;
  onChange: (value: string) => void;
  city: string;
  invalid?: boolean;
}) {
  const known = hospitals.some((name) => name.toLowerCase() === value.toLowerCase());
  const [typing, setTyping] = useState(Boolean(value) && !known);

  if (!city) {
    return <ReadOnlyValue value="Select a city first" />;
  }

  if (typing) {
    return (
      <View style={styles.hospitalTyping}>
        <TextField
          value={value}
          onChangeText={(text) => onChange(text.replace(/\s+/g, ' ').replace(/^\s/, ''))}
          placeholder="Full hospital name"
          invalid={invalid}
          maxLength={200}
          autoCapitalize="words"
        />
        <Pressable
          onPress={() => {
            setTyping(false);
            onChange('');
          }}
          hitSlop={8}
        >
          <Text style={styles.linkText}>Choose from the list instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SelectField
      options={[ADD_NEW, ...hospitals]}
      value={value}
      onChange={(picked) => {
        if (picked === ADD_NEW) {
          setTyping(true);
          onChange('');
          return;
        }
        onChange(picked);
      }}
      placeholder="Select hospital"
      title="Select Hospital"
      invalid={invalid}
      searchable
    />
  );
}

/** A titled block of fields on the form's surface. */
export function SectionCard({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
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
  row: {
    flexDirection: 'row',
    gap: 12,
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
  chipTextActive: {
    color: Colors.textOnDark,
  },
  hospitalTyping: {
    gap: 6,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  // Same surface and shadow as the patient list's sticky header card.
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
});
