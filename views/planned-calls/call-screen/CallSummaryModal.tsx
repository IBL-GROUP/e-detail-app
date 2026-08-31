import { AppBottomSheetSelect } from '@/components/ui/AppBottomSheetSelect';
import { AppButton } from '@/components/ui/AppButton';
import { AppMultiSelectSheet, MultiSelectOption } from '@/components/ui/AppMultiSelectSheet';
import { Colors } from '@/constants/theme';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface CallSummaryData {
  // The selected quick-feedback chips (joined).
  feedback: string;
  // The free-text "Additional Comment" input.
  feedbackComment: string;
  jointCall: string;
  samplesProvided: string;
  doctorInterest: 'High' | 'Medium' | 'Low';
  // Doctor picked in the summary (walking calls — single).
  selectedDoctor?: string;
  // Doctors picked in the summary (group calls — multiple, by name).
  selectedDoctors?: string[];
}

interface CallSummaryModalProps {
  visible: boolean;
  durationSeconds: number;
  slidesViewed: number;
  totalSlides: number;
  // SKUs/brands presented in this call (for the Samples Provided picker).
  sampleOptions?: string[];
  // When set, a doctor must be picked (institution/walking calls) before submit.
  requireDoctor?: boolean;
  // When set (group calls), the doctor picker is a multi-select — pick every
  // attendee. Otherwise it's a single-doctor picker (walking calls).
  multiDoctor?: boolean;
  doctorOptions?: string[];
  /** Shown when the picker has nothing to offer. */
  doctorsEmptyText?: string;
  onCancel: () => void;
  onSubmit: (summary: CallSummaryData) => void;
}

// Ordered from the rep's own manager upward (RM → SM → HOS → NSM), so the most
// common companions come first. 'No' stays first as the default.
//
// It is also the odd one out: the roles say WHO joined, 'No' says nobody did.
// See toggleJointCall — the two can never be selected together.
const JOINT_CALL_NONE = 'No';
const JOINT_CALL_OPTIONS = [JOINT_CALL_NONE, 'RM', 'SM', 'HOS', 'NSM'];
// const DOCTOR_INTEREST_OPTIONS = ['High', 'Medium', 'Low'] as const; // hidden for now
const QUICK_FEEDBACK_OPTIONS = [
  'Interested',
  'Need Follow-up',
  'Asked for Samples',
  'Price Concern',
  'Competitor Mentioned',
  'Next Visit Planned',
  'Prescribing Other Brands',
  'Plan Camp',
  'Requested for Activity',
] as const;

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = (safeSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${remainingSeconds}`;
}

export function CallSummaryModal({
  visible,
  durationSeconds,
  slidesViewed,
  totalSlides,
  sampleOptions = [],
  requireDoctor = false,
  multiDoctor = false,
  doctorOptions = [],
  doctorsEmptyText = 'No doctors available for this team.',
  onCancel,
  onSubmit,
}: CallSummaryModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDoctors, setSelectedDoctors] = useState<string[]>([]);
  const [jointCall, setJointCall] = useState<string[]>([JOINT_CALL_NONE]);
  const [samplesProvided, setSamplesProvided] = useState('None');
  const doctorHasSelection = multiDoctor
    ? selectedDoctors.length > 0
    : selectedDoctor.trim().length > 0;
  const canSubmit = !requireDoctor || doctorHasSelection;
  const sampleSelectOptions = useMemo(
    () => ['None', ...sampleOptions],
    [sampleOptions]
  );
  const doctorMultiOptions = useMemo<MultiSelectOption[]>(
    () => doctorOptions.map((name) => ({ value: name, label: name })),
    [doctorOptions],
  );
  // Doctor Interest hidden for now; keep a default for the submitted report.
  const [doctorInterest] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [selectedFeedback, setSelectedFeedback] = useState<string[]>([]);
  const [customFeedback, setCustomFeedback] = useState('');

  const safeSlidesViewed = useMemo(
    () => Math.min(Math.max(slidesViewed, 0), totalSlides),
    [slidesViewed, totalSlides]
  );

  const toggleFeedback = (option: string) => {
    setSelectedFeedback((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  };

  /**
   * "No" and the manager roles are mutually exclusive answers to one question,
   * so they can't both stand: picking RM has to clear No, and picking No has to
   * clear whoever was listed. Left as a plain multi-select, a call could be
   * submitted as "No, RM" — which is not an answer, and went to the server as
   * exactly that string.
   *
   * The roles stay multi-selectable among THEMSELVES: an RM and an SM can both
   * sit in on the same call.
   */
  const toggleJointCall = (option: string) => {
    setJointCall((current) => {
      if (option === JOINT_CALL_NONE) {
        // Tapping No always means No, including when it is already the answer —
        // deselecting it would leave the question blank, and it is the one
        // option that can't be expressed by picking something else.
        return [JOINT_CALL_NONE];
      }

      const withoutNone = current.filter((item) => item !== JOINT_CALL_NONE);
      const next = withoutNone.includes(option)
        ? withoutNone.filter((item) => item !== option)
        : [...withoutNone, option];

      // Clearing the last role puts the answer back to No rather than leaving
      // nothing selected — the question is always answered.
      return next.length > 0 ? next : [JOINT_CALL_NONE];
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          isLandscape && styles.backdropLandscape,
          {
            paddingTop: Math.max(insets.top, isLandscape ? 14 : 22),
            paddingBottom: Math.max(insets.bottom, isLandscape ? 14 : 22),
            paddingLeft: Math.max(insets.left, isLandscape ? 16 : 22),
            paddingRight: Math.max(insets.right, isLandscape ? 16 : 22),
          },
        ]}
      >
        <View
          style={[
            styles.sheet,
            isLandscape && styles.sheetLandscape,
            {
              maxHeight: height - Math.max(insets.top, isLandscape ? 14 : 22) - Math.max(insets.bottom, isLandscape ? 14 : 22),
              maxWidth: isLandscape
                ? Math.min(width - Math.max(insets.left, 16) - Math.max(insets.right, 16), 820)
                : Math.min(width - Math.max(insets.left, 22) - Math.max(insets.right, 22), 510),
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Call Summary</Text>
            <Text style={styles.subtitle}>Please complete the call report</Text>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {requireDoctor ? (
              <View style={styles.doctorField}>
                <Text style={styles.fieldLabel}>
                  {multiDoctor ? 'Doctors' : 'Doctor'} <Text style={styles.requiredMark}>*</Text>
                </Text>
                {multiDoctor ? (
                  <AppMultiSelectSheet
                    title="Select Doctors"
                    placeholder="Select doctors..."
                    options={doctorMultiOptions}
                    values={selectedDoctors}
                    onChange={setSelectedDoctors}
                    searchable
                    emptyText={doctorsEmptyText}
                  />
                ) : (
                  <AppBottomSheetSelect
                    title="Select Doctor"
                    placeholder="Select a doctor..."
                    options={doctorOptions}
                    value={selectedDoctor}
                    onChange={setSelectedDoctor}
                    searchable
                    emptyText={doctorsEmptyText}
                  />
                )}
                {!doctorHasSelection ? (
                  <Text style={styles.requiredHint}>
                    {multiDoctor
                      ? 'Please select at least one doctor to submit this call.'
                      : 'Please select a doctor to submit this call.'}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.statsRow, isLandscape && styles.statsRowLandscape]}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>{formatDuration(durationSeconds)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Slides</Text>
                <Text style={styles.statValue}>
                  {safeSlidesViewed} / {totalSlides}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Was this a joint call?</Text>
            <View style={[styles.optionRow, isLandscape && styles.optionRowLandscape]}>
              {JOINT_CALL_OPTIONS.map((option) => {
                const selected = jointCall.includes(option);
                return (
                  <Pressable
                    key={option}
                    onPress={() => toggleJointCall(option)}
                    style={[styles.optionButton, selected && styles.optionButtonActive]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Samples Provided?</Text>
            <View style={styles.sampleSelectWrap}>
              <AppBottomSheetSelect
                title="Samples Provided"
                placeholder="Select a sample..."
                options={sampleSelectOptions}
                value={samplesProvided}
                onChange={setSamplesProvided}
                searchable={sampleSelectOptions.length > 6}
              />
            </View>

            {/* Doctor Interest hidden for now
            <Text style={styles.fieldLabel}>Doctor Interest</Text>
            <View style={styles.threeColumnRow}>
              {DOCTOR_INTEREST_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setDoctorInterest(option)}
                  style={[
                    styles.largeOptionButton,
                    doctorInterest === option && styles.largeOptionButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.largeOptionText,
                      doctorInterest === option && styles.largeOptionTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
            */}

            <Text style={styles.fieldLabel}>Quick Feedback</Text>
            <Text style={styles.helperText}>Select the points that match this doctor call.</Text>
            <View style={[styles.feedbackOptions, isLandscape && styles.feedbackOptionsLandscape]}>
              {QUICK_FEEDBACK_OPTIONS.map((option) => {
                const selected = selectedFeedback.includes(option);

                return (
                  <Pressable
                    key={option}
                    onPress={() => toggleFeedback(option)}
                    style={[
                      styles.feedbackChip,
                      selected && styles.feedbackChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        selected && styles.feedbackChipTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Additional Comment</Text>
            <TextInput
              value={customFeedback}
              onChangeText={setCustomFeedback}
              placeholder="Add a custom comment (optional)"
              placeholderTextColor="#7B8493"
              multiline
              style={styles.commentInput}
            />
          </ScrollView>

          <View style={[styles.actions, isLandscape && styles.actionsLandscape]}>
            <AppButton
              label="Cancel"
              onPress={onCancel}
              variant="secondary"
              style={styles.cancelButton}
              textStyle={styles.cancelText}
            />
            <AppButton
              label="Submit"
              onPress={() => {
                if (!canSubmit) return;
                onSubmit({
                  // Quick-feedback chips only; the free-text goes separately.
                  feedback: selectedFeedback.join(', '),
                  feedbackComment: customFeedback.trim(),
                  jointCall: jointCall.join(', '),
                  samplesProvided,
                  doctorInterest,
                  selectedDoctor: selectedDoctor.trim() || undefined,
                  selectedDoctors: multiDoctor ? selectedDoctors : undefined,
                });
              }}
              variant="primary"
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              textStyle={styles.submitText}
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
  backdropLandscape: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  sheet: {
    width: '100%',
    maxWidth: 510,
    maxHeight: '92%',
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  sheetLandscape: {
    borderRadius: 20,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 16,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 14,
    marginTop: 10,
  },
  scrollArea: {
    flexGrow: 0,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  contentLandscape: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  statsRowLandscape: {
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#F5F7FA',
    paddingVertical: 17,
    alignItems: 'center',
  },
  statLabel: {
    color: '#94A0B2',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statValue: {
    color: '#202735',
    fontSize: 23,
    fontWeight: '800',
    marginTop: 8,
  },
  fieldLabel: {
    color: '#44536A',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 7,
  },
  doctorField: {
    marginBottom: 22,
  },
  requiredMark: {
    color: Colors.danger,
    fontWeight: '800',
  },
  requiredHint: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 26,
  },
  optionRowLandscape: {
    marginBottom: 20,
  },
  optionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButtonActive: {
    backgroundColor: Colors.primary,
  },
  optionText: {
    color: '#5B6A7F',
    fontSize: 14,
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 26,
  },
  sampleSelectWrap: {
    marginBottom: 26,
  },
  threeColumnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 26,
  },
  largeOptionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeOptionButtonActive: {
    backgroundColor: Colors.primary,
  },
  largeOptionText: {
    color: '#5B6A7F',
    fontSize: 16,
    fontWeight: '800',
  },
  largeOptionTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    color: '#7B8493',
    fontSize: 13,
    marginBottom: 30,
  },
  commentInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    textAlignVertical: 'top',
    marginTop: 7,
  },
  feedbackOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 30,
  },
  feedbackOptionsLandscape: {
    marginBottom: 20,
  },
  feedbackChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#EEF2F6',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  feedbackChipText: {
    color: '#5B6A7F',
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackChipTextActive: {
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8EDF5',
    backgroundColor: '#FFFFFF',
  },
  actionsLandscape: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  cancelButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '800',
  },
  submitButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 0,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '800',
  },
});
