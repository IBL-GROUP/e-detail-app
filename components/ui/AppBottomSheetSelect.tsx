import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

interface AppBottomSheetSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  title: string;
  searchPlaceholder?: string;
  emptyText?: string;
  showChevron?: boolean;
  chevronColor?: string;
  searchable?: boolean;
  triggerStyle?: StyleProp<ViewStyle>;
  triggerContentStyle?: StyleProp<ViewStyle>;
  triggerTextStyle?: StyleProp<TextStyle>;
  /**
   * Offer what was typed in the search box as a new option ("Add “…”") when
   * nothing in the list matches it exactly. Off by default.
   */
  allowCustom?: boolean;
}

export function AppBottomSheetSelect({
  options,
  value,
  onChange,
  placeholder,
  title,
  searchPlaceholder = 'Search',
  emptyText = 'No options available.',
  showChevron = true,
  chevronColor = Colors.textMuted,
  searchable = true,
  triggerStyle,
  triggerContentStyle,
  triggerTextStyle,
  allowCustom = false,
}: AppBottomSheetSelectProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      option.toLowerCase().includes(normalizedQuery)
    );
  }, [options, searchQuery]);

  // The typed text, offered as a new option when allowCustom is on and no
  // option already has that name.
  const customOption = useMemo(() => {
    if (!allowCustom) return '';
    const typed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!typed) return '';
    const exists = options.some((option) => option.toLowerCase() === typed.toLowerCase());
    return exists ? '' : typed;
  }, [allowCustom, options, searchQuery]);

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

  return (
    <>
      <Pressable
        onPress={() => {
          setSearchQuery('');
          setSheetVisible(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          triggerStyle,
          triggerContentStyle,
          pressed && styles.triggerPressed,
        ]}
      >
        <Text
          style={[
            styles.triggerText,
            !value && styles.placeholderText,
            triggerTextStyle,
          ]}
        >
          {value || placeholder}
        </Text>
        {showChevron ? (
          <Ionicons name="chevron-down" size={20} color={chevronColor} />
        ) : null}
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropOpacity,
            },
          ]}
        >
          <Pressable style={styles.backdropDismiss} onPress={closeSheet} />

          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{title}</Text>

            {searchable ? (
              <View style={styles.searchBox}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={Colors.textMuted}
                />
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
              // So "Add …" works on the first tap while the keyboard is up.
              keyboardShouldPersistTaps={allowCustom ? 'handled' : undefined}
            >
              {customOption ? (
                <Pressable
                  onPress={() => {
                    onChange(customOption);
                    closeSheet();
                  }}
                  style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
                >
                  <Text style={[styles.optionText, styles.optionTextSelected]}>
                    + Add “{customOption}” as new
                  </Text>
                </Pressable>
              ) : null}

              {filteredOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    onChange(option);
                    closeSheet();
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    option === value && styles.optionRowSelected,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      option === value && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}

              {filteredOptions.length === 0 && !customOption ? (
                <Text style={styles.emptyText}>{emptyText}</Text>
              ) : null}
            </ScrollView>

            <Pressable
              onPress={closeSheet}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.optionRowPressed,
              ]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerPressed: {
    opacity: 0.8,
  },
  triggerText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
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
    height: '50%',
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
    justifyContent: 'center',
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
  optionText: {
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
  cancelButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cancelText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
