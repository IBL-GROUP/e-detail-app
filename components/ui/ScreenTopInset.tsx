import { createContext, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Whether the sync/offline banner is drawn above the screens.
 *
 * The banner sits under the status bar and pads itself by the status-bar
 * height, so a screen below it must NOT pad by that height again. A
 * `SafeAreaView edges={['top']}` cannot be trusted to work that out — on
 * Android edge-to-edge it pads by the full inset regardless, which left a
 * status-bar-sized white band between the banner and every header.
 */
const BannerShownContext = createContext(false);

export const StatusBannerProvider = BannerShownContext.Provider;

/** Top padding a screen header needs: the status-bar inset, or 0 under the banner. */
export function useScreenTopInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(BannerShownContext) ? 0 : insets.top;
}
