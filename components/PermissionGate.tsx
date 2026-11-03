import { usePermissions } from '@/lib/auth/permissions';
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

/**
 * Wraps a screen that can be reached other than through its dashboard card
 * (e.g. the tab the app opens on). A rep without the card's VIEW permission is
 * sent back to the dashboard. `section` is the same section_code the card
 * carries.
 */
export function PermissionGate({ section, children }: { section: string; children: ReactNode }) {
  const { isReady, canView } = usePermissions();
  // Not known yet: render nothing rather than flash the screen or bounce a rep
  // who does hold the permission.
  if (!isReady) return null;
  if (!canView(section)) return <Redirect href="/" />;
  return <>{children}</>;
}
