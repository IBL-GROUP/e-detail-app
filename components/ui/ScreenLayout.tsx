import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppHeader } from '@/components/ui/AppHeader';
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
  const { scrollRef, scrollProps } = useKeyboardAwareScroll(scrollable);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
        <KeyboardAvoidingView
          style={styles.scroll}
          // iOS does not resize for the keyboard, so the padding is what makes
          // the room to scroll into. Android already resizes; adding more here
          // would shrink the page twice.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.content, contentStyle]}
            showsVerticalScrollIndicator={false}
            {...scrollProps}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.flat, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
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
    paddingBottom: 32,
  },
  flat: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
