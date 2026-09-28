import { Platform } from 'react-native';

// Searle brand palette — single source of truth
export const Colors = {
  primary: '#2B73B8',       // Searle steel blue (logo)
  primaryLight: '#C8DDEF',  // light tint of primary — for subtle card backgrounds
  secondary: '#1B2C6E',     // Searle dark navy (portfolio bg)
  text: '#313131',          // primary body text
  textMuted: '#6B7280',     // secondary / muted text
  textOnDark: '#FFFFFF',    // text on dark/colored backgrounds
  background: '#F5F7FA',    // screen background
  surface: '#FFFFFF',       // card / sheet background
  border: '#E5E7EB',        // subtle borders
  success: '#15803D',
  successBg: '#DCFCE7',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  warning: '#B45309',
  warningBg: '#FEF3C7',

  // Disabled controls — always neutral gray, never a tint of the enabled
  // colour, so "you can't press this yet" reads at a glance.
  disabledBg: '#E9EBEF',
  disabledBorder: '#D3D7DE',
  disabledText: '#9CA3AF',

  // legacy light/dark kept for existing hooks
  light: {
    text: '#313131',
    background: '#F5F7FA',
    tint: '#2B73B8',
    icon: '#6B7280',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#2B73B8',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#FFFFFF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#FFFFFF',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
