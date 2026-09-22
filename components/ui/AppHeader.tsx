import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface AppHeaderProps {
  /** Screen title (e.g. "Planned Calls"). When provided, shown instead of greeting. */
  title?: string;
  subtitle?: string;
  userName?: string;
  notificationCount?: number;
  onNotification?: () => void;
  action?: React.ReactNode;
  /** When set, a back chevron is shown to the left of the title. */
  onBack?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  userName,
  notificationCount = 0,
  onNotification,
  action,
  onBack,
}: AppHeaderProps) {
  const { user } = useAuth();
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.primary} />
          </Pressable>
        ) : null}

        <Image
          source={require('@/assets/logo/OneForce_emblem.svg')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="OneForce"
        />

        <View style={styles.titleBlock}>
          <Text style={styles.greeting}>
            {title ?? `Hello, ${userName ?? user?.name ?? 'John Doe'}`}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.date}>{formattedDate}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.right}>
        {/* Notification bell hidden for now — restore when notifications ship.
        <Pressable style={styles.bellWrapper} onPress={onNotification}>
          <Ionicons name="notifications-outline" size={20} color={Colors.secondary} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount}</Text>
            </View>
          )}
        </Pressable>
        */}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 32,
    aspectRatio: 285 / 274,
    marginRight: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.textOnDark,
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
