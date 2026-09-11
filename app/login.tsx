import { Colors } from '@/constants/theme';
import { LOGIN_EMAIL_DOMAIN, useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const { isAuthenticated, isHydrated, login, isSyncingOfflineUsers } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Which field the caret is in — only the active field takes the brand edge,
  // so the form shows where typing lands without any decoration elsewhere.
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(
    null,
  );

  // Sign In is disabled while the on-open offline login sync runs (or while
  // submitting), so the offline account list is ready before the first sign-in.
  const signInDisabled = isSubmitting || isSyncingOfflineUsers;

  if (!isHydrated) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setLoginError('Enter both username and password.');
      return;
    }

    setLoginError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Unable to sign in right now.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Two very low-opacity brand washes in the corners. Enough for the page
          to read as blue rather than plain grey, far short of a coloured panel
          — at 6–7% they sit behind the card without competing with it. */}
      <View style={styles.washTop} />
      <View style={styles.washBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/*
            One centred column on a plain background: wordmark, then the form.
            No coloured panel behind it — a slab of navy only fills part of the
            height, and whatever it doesn't cover reads as an empty half-screen.
          */}
          <View style={styles.column}>
            <View style={styles.brand}>
              {/* Tinted, not solid — gives the wordmark something to sit under
                  in what was an empty band, without a block of colour. The
                  OneForce mark inside it carries its own padding, so it is
                  drawn at the tile's full size. */}
              <View style={styles.brandMark}>
                <Image
                  source={require('@/assets/logo/oneforce.svg')}
                  style={styles.brandLogo}
                  contentFit="contain"
                  accessibilityLabel="OneForce logo"
                />
              </View>

              {/* <Text style={styles.heroEyebrow}>Searle E-Detailing</Text> */}
              <Text style={styles.brandTitle}>OneForce</Text>
              <Text style={styles.brandSubtitle}>Sign in to access.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.formTitle}>Welcome back</Text>
              <Text style={styles.formSubtitle}>Use your Medical Rep account to continue.</Text>

              <View style={styles.divider} />

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>User ID</Text>
                <View
                  style={[
                    styles.inputShell,
                    focusedField === 'username' && styles.inputShellFocused,
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={
                      focusedField === 'username' ? Colors.primary : Colors.textMuted
                    }
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Enter your ID"
                    placeholderTextColor="#9AA4B4"
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                {username.trim() && !username.includes('@') ? (
                  <Text style={styles.inputHint}>
                    Signing in as {username.trim()}
                    {LOGIN_EMAIL_DOMAIN}
                  </Text>
                ) : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View
                  style={[
                    styles.inputShell,
                    focusedField === 'password' && styles.inputShellFocused,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={
                      focusedField === 'password' ? Colors.primary : Colors.textMuted
                    }
                  />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#9AA4B4"
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.eyeButton,
                      pressed && styles.eyeButtonPressed,
                    ]}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>
              </View>

              {loginError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                  <Text style={styles.errorText}>{loginError}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => {
                  void handleSubmit();
                }}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && !signInDisabled ? styles.submitButtonPressed : null,
                  signInDisabled ? styles.submitButtonDisabled : null,
                ]}
                disabled={signInDisabled}
              >
                {signInDisabled ? (
                  <ActivityIndicator color={Colors.textOnDark} />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={17} color={Colors.textOnDark} />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    // A hint of blue in the page itself rather than the neutral grey.
    backgroundColor: '#EFF4FA',
    overflow: 'hidden',
  },
  washTop: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(43, 115, 184, 0.07)',
    top: -150,
    right: -120,
  },
  washBottom: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(27, 44, 110, 0.05)',
    bottom: -130,
    left: -110,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  // flexGrow + centre: the block sits in the middle of whatever height the
  // device gives it, and still scrolls when the keyboard takes the space.
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  column: {
    width: '100%',
    // Wide enough to give the fields room, still capped so it never stretches
    // across a tablet or a browser window.
    maxWidth: 480,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 22,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3EDF9',
    borderWidth: 1,
    borderColor: '#CEDFF1',
    marginBottom: 16,
  },
  brandLogo: {
    width: 60,
    height: 60,
  },
  brandTitle: {
    color: Colors.secondary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  brandSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  heroEyebrow: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  card: {
    borderRadius: 14,
    backgroundColor: Colors.surface,
    padding: 26,
    gap: 16,
    borderWidth: 1,
    borderColor: '#DCE5F0',
    // Soft and wide rather than dark and tight: the card should look set on the
    // page, not floating above it.
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  formTitle: {
    color: Colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  formSubtitle: {
    color: Colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: -12,
  },
  // Separates the greeting from the fields, so the card reads as two parts
  // instead of one undifferentiated stack.
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: -2,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE3EC',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Just the edge and the icon change colour — no glow, no fill swap.
  inputShellFocused: {
    borderColor: Colors.primary,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  eyeButton: {
    padding: 4,
    borderRadius: 6,
  },
  eyeButtonPressed: {
    backgroundColor: '#EEF2F7',
  },
  inputHint: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  errorBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5B9B9',
    backgroundColor: Colors.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  submitButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  submitButtonPressed: {
    opacity: 0.9,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
