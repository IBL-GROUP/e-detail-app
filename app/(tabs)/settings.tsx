import { AppButton } from '@/components/ui/AppButton';
import { ScreenLayout } from '@/components/ui/ScreenLayout';
import { Colors } from '@/constants/theme';
import { ROLE_LABELS, useAuth } from '@/providers/AuthProvider';
import { useSync } from '@/providers/SyncProvider';
import { useSyncBacklog } from '@/lib/offline/useSyncBacklog';
import { SyncDetailsModal } from '@/views/settings/SyncDetailsModal';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View, type ViewStyle } from 'react-native';

// react-native-web supports `position: sticky`, but RN's ViewStyle type doesn't
// list it — cast to keep the account card pinned while the page scrolls (web).
const STICKY_SIDE_COLUMN = { position: 'sticky', top: 16 } as unknown as ViewStyle;

// Security Settings (2FA / Biometric / Session Timeout) are placeholder toggles
// that don't do anything yet — hidden for now. Flip to true when they're wired.
const SHOW_SECURITY_SETTINGS = false;

function formatSyncedAt(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface SettingsCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}

function SettingsCard({ icon, title, children }: SettingsCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

interface PasswordFieldProps {
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
}

function PasswordField({ label, placeholder, icon, value, onChangeText }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={18} color="#9AA7B8" />
        <TextInput
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor="#7B8493"
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
        />
        <Pressable
          onPress={() => setShow((current) => !current)}
          hitSlop={10}
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
        >
          <Ionicons
            name={show ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color="#7B8493"
          />
        </Pressable>
      </View>
    </View>
  );
}

interface SecurityRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function SecurityRow({ label, value, onValueChange }: SecurityRowProps) {
  return (
    <View style={styles.securityRow}>
      <Text style={styles.securityLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#DDE4EC', true: Colors.primaryLight }}
        thumbColor={value ? Colors.primary : Colors.surface}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const { user, logout, changePassword } = useAuth();
  const { lastSyncedAt, isOnline, status, syncNow } = useSync();
  const backlog = useSyncBacklog(user?.mieId);
  const [isSyncDetailsVisible, setIsSyncDetailsVisible] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [sessionTimeoutEnabled, setSessionTimeoutEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwMessage, setPwMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleUpdatePassword = async () => {
    setPwMessage(null);
    if (!currentPassword) {
      setPwMessage({ type: 'error', text: 'Enter your current password.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (newPassword === currentPassword) {
      setPwMessage({
        type: 'error',
        text: 'New password must be different from the current one.',
      });
      return;
    }
    setPwSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (error) {
      setPwMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to change password.',
      });
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <>
      <ScreenLayout
        title="Settings"
        subtitle="Manage your account and security preferences"
        contentStyle={styles.content}
      >
        <View style={[styles.grid, isWide && styles.gridWide]}>
          <View
            style={[
              styles.sideColumn,
              isWide && styles.sideColumnWide,
              isWide && Platform.OS === 'web' && STICKY_SIDE_COLUMN,
            ]}
          >
            <View style={styles.accountCard}>
              <View style={styles.avatar}>
                <Ionicons name="person-outline" size={34} color={Colors.primary} />
              </View>
              <Text style={styles.accountTitle}>Account Info</Text>
              <Text style={styles.accountSubtitle}>{user?.name ?? 'Active user session'}</Text>

              <View style={styles.accountMeta}>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>Role</Text>
                  <Text style={styles.accountValue}>
                    {user?.role ? ROLE_LABELS[user.role] : 'Medical Rep'}
                  </Text>
                </View>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>Username</Text>
                  <Text style={styles.accountValue}>{user?.username ?? 'rep'}</Text>
                </View>
                {user?.team ? (
                  <View style={styles.accountRow}>
                    <Text style={styles.accountLabel}>Team</Text>
                    <Text style={styles.accountValue}>{user.team}</Text>
                  </View>
                ) : null}
                <AppButton
                  label="Logout"
                  variant="outline"
                  onPress={() => {
                    void logout();
                  }}
                  style={styles.logoutButton}
                  textStyle={styles.logoutButtonText}
                  icon={<Ionicons name="log-out-outline" size={18} color={Colors.primary} />}
                />
              </View>
            </View>
          </View>

          <View style={[styles.mainColumn, isWide && styles.mainColumnWide]}>
            <SettingsCard icon="lock-closed-outline" title="Change Password">
              <PasswordField
                label="Current Password"
                placeholder="Enter your current password"
                icon="key-outline"
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <PasswordField
                label="New Password"
                placeholder="Minimum 6 characters"
                icon="lock-closed-outline"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <PasswordField
                label="Confirm Password"
                placeholder="Repeat new password"
                icon="checkmark-circle-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {pwMessage ? (
                <Text
                  style={[
                    styles.pwMessage,
                    pwMessage.type === 'error' ? styles.pwError : styles.pwSuccess,
                  ]}
                >
                  {pwMessage.text}
                </Text>
              ) : null}
              <AppButton
                label={pwSubmitting ? 'Updating…' : 'Update Password'}
                onPress={() => {
                  void handleUpdatePassword();
                }}
                icon={<Ionicons name="arrow-forward" size={18} color={Colors.textOnDark} />}
                style={styles.updateButton}
              />
            </SettingsCard>

            {/* Call Type (Territory / Institution) is hidden for now. The control
                lives in components/ui/CallModeToggle for when it comes back. */}

            <SettingsCard icon="cloud-offline-outline" title="Offline Data">
              <View style={styles.securityRow}>
                <Text style={styles.securityLabel}>Connection</Text>
                <Text style={styles.accountValue}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
              <View style={styles.securityRow}>
                <Text style={styles.securityLabel}>Last synced</Text>
                <Text style={styles.accountValue}>
                  {formatSyncedAt(lastSyncedAt)}
                </Text>
              </View>
              <View style={styles.syncActions}>
                <AppButton
                  label={status === 'syncing' ? 'Syncing…' : 'Sync now'}
                  onPress={() => void syncNow()}
                  icon={
                    <Ionicons name="sync-outline" size={18} color={Colors.textOnDark} />
                  }
                  style={styles.syncButton}
                />
                <Pressable
                  onPress={() => setIsSyncDetailsVisible(true)}
                  style={({ pressed }) => [styles.syncDetailsButton, pressed && styles.pressed]}
                  accessibilityLabel="Open sync details"
                >
                  <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                  {backlog.unsyncedTotal > 0 ? (
                    <View style={styles.syncDetailsBadge}>
                      <Text style={styles.syncDetailsBadgeText}>
                        {backlog.unsyncedTotal > 99 ? '99+' : backlog.unsyncedTotal}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            </SettingsCard>

            {SHOW_SECURITY_SETTINGS ? (
              <SettingsCard icon="shield-checkmark-outline" title="Security Settings">
                <SecurityRow
                  label="Two-Factor Authentication"
                  value={twoFactorEnabled}
                  onValueChange={setTwoFactorEnabled}
                />
                <SecurityRow
                  label="Biometric Login"
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                />
                <SecurityRow
                  label="Session Timeout (15 mins)"
                  value={sessionTimeoutEnabled}
                  onValueChange={setSessionTimeoutEnabled}
                />
              </SettingsCard>
            ) : null}

          </View>
        </View>
      </ScreenLayout>

      {/* Outside ScreenLayout: a Modal nested in its ScrollView never
          presents on Android — every other modal here is a screen-root
          sibling for the same reason. */}
      <SyncDetailsModal
        visible={isSyncDetailsVisible}
        onClose={() => setIsSyncDetailsVisible(false)}
        backlog={backlog}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
  },
  grid: {
    gap: 16,
  },
  gridWide: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
  },
  mainColumn: {
    gap: 16,
  },
  mainColumnWide: {
    flex: 1,
  },
  sideColumn: {
    gap: 16,
  },
  sideColumnWide: {
    width: 280,
  },
  card: {
    borderRadius: 16,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  cardBody: {
    padding: 18,
    gap: 16,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  updateButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  syncActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  syncButton: {
    minHeight: 40,
    paddingHorizontal: 18,
  },
  syncDetailsButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncDetailsBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warning,
  },
  syncDetailsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textOnDark,
  },
  pressed: {
    opacity: 0.75,
  },
  pwMessage: {
    fontSize: 13,
    fontWeight: '700',
  },
  pwError: {
    color: Colors.danger,
  },
  pwSuccess: {
    color: '#059669',
  },
  securityRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  securityLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  accountCard: {
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(43,115,184,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  accountTitle: {
    color: Colors.secondary,
    fontSize: 16,
    fontWeight: '800',
  },
  accountSubtitle: {
    color: Colors.text,
    fontSize: 14,
    marginTop: 5,
    marginBottom: 16,
  },
  accountMeta: {
    width: '100%',
    gap: 12,
  },
  logoutButton: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
  logoutButtonText: {
    color: Colors.primary,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  accountLabel: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  accountValue: {
    color: Colors.secondary,
    fontSize: 14,
    fontWeight: '800',
  },
});
