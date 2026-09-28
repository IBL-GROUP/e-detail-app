import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/theme';

/** The stock reasons a rep can pick; "Other" requires a written note. */
export const CANCEL_REASONS = [
  'Doctor not available',
  'Doctor busy — no time',
  'Clinic closed',
  'Doctor refused to meet',
  'Waiting time too long',
  'Wrong / changed clinic timing',
  'Personal emergency',
  'Other',
] as const;

const OTHER_REASON = 'Other';

interface CancelCallModalProps {
  visible: boolean;
  /** What is being cancelled — a doctor name, or the group call being set up. */
  subject: string;
  submitting?: boolean;
  onDismiss: () => void;
  /** Called with the final reason text (the note when "Other" was picked). */
  onConfirm: (reason: string) => void;
}

/**
 * Asks why the rep is cancelling before the call is written off. The reason is
 * required — a cancellation with no explanation isn't worth recording.
 */
export function CancelCallModal({
  visible,
  subject,
  submitting = false,
  onDismiss,
  onConfirm,
}: CancelCallModalProps) {
  const insets = useSafeAreaInsets();

  const { width, height } = useWindowDimensions();
  const [selectedReason, setSelectedReason] = useState('');
  const [note, setNote] = useState('');

  const isOther = selectedReason === OTHER_REASON;
  const trimmedNote = note.trim();
  // "Other" is only meaningful with a note; the stock reasons stand alone.
  const canSubmit = isOther ? trimmedNote.length > 0 : selectedReason.length > 0;

  const reset = () => {
    setSelectedReason('');
    setNote('');
  };

  const handleDismiss = () => {
    if (submitting) return;
    reset();
    onDismiss();
  };

  const handleConfirm = () => {
    if (!canSubmit || submitting) return;
    // A stock reason keeps any note the rep added as extra detail.
    const reason = isOther
      ? trimmedNote
      : trimmedNote
        ? `${selectedReason} — ${trimmedNote}`
        : selectedReason;
    onConfirm(reason);
    reset();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(insets.top, 22),
            paddingBottom: Math.max(insets.bottom, 22),
            paddingLeft: Math.max(insets.left, 22),
            paddingRight: Math.max(insets.right, 22),
          },
        ]}
      >
        <View
          style={[
            styles.sheet,
            {
              maxHeight: height - Math.max(insets.top, 22) - Math.max(insets.bottom, 22),
              maxWidth: Math.min(
                width - Math.max(insets.left, 22) - Math.max(insets.right, 22),
                510,
              ),
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Cancel Call</Text>
            <Text style={styles.subtitle}>Why are you cancelling this call?</Text>
          </View>

          <KeyboardAwareScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.content}
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.subjectLine}>{subject}</Text>

            <View style={styles.reasonList}>
              {CANCEL_REASONS.map((reason) => {
                const active = reason === selectedReason;
                return (
                  <Pressable
                    key={reason}
                    onPress={() => setSelectedReason(reason)}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      active && styles.reasonRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                      {reason}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.noteLabel}>
              {isOther ? 'Reason (required)' : 'Additional note (optional)'}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={
                isOther ? 'Describe why the call was cancelled' : 'Anything else to add?'
              }
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              style={styles.noteInput}
            />
          </KeyboardAwareScrollView>

          <View style={styles.footer}>
            <AppButton
              label="Keep Call"
              variant="outline"
              onPress={handleDismiss}
              style={styles.footerButton}
            />
            <AppButton
              label={submitting ? 'Cancelling…' : 'Cancel Call'}
              onPress={canSubmit && !submitting ? handleConfirm : undefined}
              style={[
                styles.footerButton,
                styles.confirmButton,
                (!canSubmit || submitting) && styles.confirmButtonDisabled,
              ]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  sheet: {
    width: '100%',
    maxWidth: 510,
    maxHeight: '92%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.danger,
    padding: 16,
    alignItems: 'center',
  },
  title: {
    color: Colors.textOnDark,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  scrollArea: {
    flexGrow: 0,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  subjectLine: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  reasonList: {
    gap: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  reasonRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  pressed: {
    opacity: 0.8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  reasonTextActive: {
    color: Colors.secondary,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 4,
  },
  noteInput: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerButton: {
    flex: 1,
  },
  confirmButton: {
    backgroundColor: Colors.danger,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
});
