import { StyleSheet, View, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { AppHeader } from '@/components/ui/AppHeader';
import { useScreenTopInset } from '@/components/ui/ScreenTopInset';
import { Colors } from '@/constants/theme';

interface ScreenLayoutProps {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  title?: string;
  subtitle?: string;
  userName?: string;
  notificationCount?: number;
  onNotification?: () => void;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  /** Show a back chevron in the header (for screens opened from the dashboard). */
  showBack?: boolean;
}

/** Back to the previous screen, or to the dashboard when opened without history. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}

export function ScreenLayout({
  children,
  headerAction,
  title,
  subtitle,
  userName,
  notificationCount,
  onNotification,
  scrollable = true,
  contentStyle,
  showBack = false,
}: ScreenLayoutProps) {
  // Below the status bar — or straight below the sync banner, which already
  // covers it.
  const topInset = useScreenTopInset();
  return (
    <View style={[styles.safe, { paddingTop: topInset }]}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        userName={userName}
        notificationCount={notificationCount}
        onNotification={onNotification}
        action={headerAction}
        onBack={showBack ? goBack : undefined}
      />
      {scrollable ? (
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          // Gap left between the focused field and the top of the keyboard.
          bottomOffset={24}
          // Without this the first tap on a button while the keyboard is up
          // only dismisses the keyboard, and the button needs tapping twice.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={[styles.flat, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 14,
    // The same 16 as the other sides: a gap under the last item, nothing extra.
    paddingBottom: 16,
  },
  flat: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
