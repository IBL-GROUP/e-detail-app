import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface AppMultiSelectSheetProps {
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  title: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchable?: boolean;
}

export function AppMultiSelectSheet({
  options,
  values,
  onChange,
  placeholder,
  title,
  searchPlaceholder = 'Search',
  emptyText = 'No options available.',
  searchable = true,
}: AppMultiSelectSheetProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Selection snapshotted when the sheet opens — used to sort selected-first
  // without rows jumping around as the user toggles during this session.
  const [openSelected, setOpenSelected] = useState<Set<string>>(new Set());

  const selectedSet = useMemo(() => new Set(values), [values]);

  // Show the selected rows first (snapshot order), then the rest. A stable sort
  // keeps each group in its original order.
  const orderedOptions = useMemo(() => {
    return [...options].sort(
      (a, b) => (openSelected.has(b.value) ? 1 : 0) - (openSelected.has(a.value) ? 1 : 0),
    );
  }, [options, openSelected]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return orderedOptions;
    }

    return orderedOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery)
    );
  }, [orderedOptions, searchQuery]);

  // What's selected, in the options' own order — one pill each on the trigger.
  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => selectedSet.has(option.value))
        .map((option) => option.label),
    [options, selectedSet],
  );

  useEffect(() => {
    if (sheetVisible) {
      setModalVisible(true);
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(backdropOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setModalVisible(false);
      }
    });
  }, [backdropOpacity, sheetVisible]);

  const closeSheet = () => {
    setSheetVisible(false);
    setSearchQuery('');
  };

  const toggleOption = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(values.filter((current) => current !== value));
      return;
    }
    onChange([...values, value]);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          setSearchQuery('');
          setOpenSelected(new Set(values));
          setSheetVisible(true);
        }}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        {selectedLabels.length === 0 ? (
          <Text numberOfLines={1} style={[styles.triggerText, styles.placeholderText]}>
            {placeholder}
          </Text>
        ) : (
          // One pill per selection, wrapping onto further lines as needed. The
          // trigger grows with them rather than truncating the names.
          <View style={styles.pillWrap}>
            {selectedLabels.map((label) => (
              <View key={label} style={styles.pill}>
                <Text style={styles.pillText} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdropDismiss} onPress={closeSheet} />

          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{title}</Text>

            {searchable ? (
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.searchInput}
                />
              </View>
            ) : null}

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.listScroll}
              contentContainerStyle={styles.sheetList}
            >
              {filteredOptions.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => toggleOption(option.value)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                      pressed && styles.optionRowPressed,
                    ]}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected ? (
                        <Ionicons name="checkmark" size={16} color={Colors.textOnDark} />
                      ) : null}
                    </View>
                    <Text
                      style={[styles.optionText, isSelected && styles.optionTextSelected]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}

              {filteredOptions.length === 0 ? (
                <Text style={styles.emptyText}>{emptyText}</Text>
              ) : null}
            </ScrollView>

            <Pressable
              onPress={closeSheet}
              style={({ pressed }) => [styles.doneButton, pressed && styles.optionRowPressed]}
            >
              <Text style={styles.doneText}>
                {values.length > 0 ? `Done (${values.length})` : 'Done'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    // Pills can wrap onto more than one line, so pad vertically rather than
    // relying on a fixed row height.
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerPressed: {
    opacity: 0.8,
  },
  triggerText: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pillWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    color: Colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  placeholderText: {
    color: Colors.textMuted,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    height: '60%',
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
  },
  searchBox: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
    borderWidth: 0,
  },
  listScroll: {
    flex: 1,
  },
  sheetList: {
    paddingBottom: 8,
  },
  optionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    paddingHorizontal: 4,
  },
  optionRowSelected: {
    backgroundColor: '#F8FAFC',
  },
  optionRowPressed: {
    opacity: 0.7,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionText: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 18,
  },
  doneButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  doneText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
});
