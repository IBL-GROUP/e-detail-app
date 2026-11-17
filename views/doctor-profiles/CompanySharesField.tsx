import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CompanyShare } from '@/api/doctorProfiles';
import { Colors } from '@/constants/theme';
import { SelectField, formStyles } from './formParts';

/**
 * Other Company Prescriber: which other pharma companies this doctor writes,
 * and what share of their prescriptions each takes. The shares must total 100%
 * (BRD; checked again by the server, DOC-BR-009).
 *
 * The Searle app's OtherCompanyPrescriber, restyled: a company dropdown from
 * the pharma master and a % box per row, with a live running total.
 */
export function CompanySharesField({
  value,
  onChange,
  companies,
  invalid = false,
}: {
  value: CompanyShare[];
  onChange: (next: CompanyShare[]) => void;
  /** Pharma company names from /doctor-profiles/master. */
  companies: string[];
  invalid?: boolean;
}) {
  const rows = value.length ? value : [{ company: '', percent: 0 }];
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const remaining = Math.max(0, 100 - total);

  const used = new Set(rows.map((row) => row.company).filter(Boolean));

  const setRow = (index: number, patch: Partial<CompanyShare>) => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (total >= 100) return;
    onChange([...rows, { company: '', percent: 0 }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange([{ company: '', percent: 0 }]);
      return;
    }
    onChange(rows.filter((_, position) => position !== index));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Allocate shares to total 100%. Remaining: {remaining}%</Text>

      {rows.map((row, index) => {
        // A company already on another row isn't offered again.
        const available = companies.filter((name) => name === row.company || !used.has(name));
        return (
          <View key={`share-${index}`} style={styles.row}>
            <View style={styles.companyCol}>
              <SelectField
                options={available}
                value={row.company}
                onChange={(company) => setRow(index, { company })}
                placeholder="Select company"
                title="Select Company"
                invalid={invalid && !row.company}
                searchable
              />
            </View>
            <View style={styles.percentCol}>
              <TextInput
                value={row.percent ? String(row.percent) : ''}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
                  setRow(index, { percent: digits ? Number(digits) : 0 });
                }}
                placeholder="%"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={3}
                style={[formStyles.input, invalid && !row.percent && formStyles.inputError]}
              />
            </View>
            <Pressable
              onPress={() => removeRow(index)}
              hitSlop={8}
              style={styles.remove}
              accessibilityLabel="Remove company"
            >
              <Ionicons name="close-circle" size={22} color={Colors.danger} />
            </Pressable>
          </View>
        );
      })}

      <View style={styles.footer}>
        <Pressable
          onPress={addRow}
          disabled={total >= 100}
          hitSlop={8}
          style={({ pressed }) => [styles.add, (pressed || total >= 100) && styles.addDim]}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.addText}>Add company</Text>
        </Pressable>
        <Text style={[styles.total, total === 100 ? styles.totalOk : styles.totalWarn]}>
          Total: {total}%{total === 100 ? '' : ' (must equal 100%)'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyCol: {
    flex: 1,
    minWidth: 0,
  },
  percentCol: {
    width: 72,
  },
  remove: {
    padding: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addDim: {
    opacity: 0.5,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  total: {
    fontSize: 13,
    fontWeight: '800',
  },
  totalOk: {
    color: Colors.success,
  },
  totalWarn: {
    color: Colors.danger,
  },
});
