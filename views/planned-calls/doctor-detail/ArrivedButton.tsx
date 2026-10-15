import { DoctorActionButton } from './DoctorActionButton';

interface ArrivedButtonProps {
  onPress?: () => void;
  arrived?: boolean;
  enabled?: boolean;
  /**
   * The GPS fix for this arrival is still on its way. Start/Cancel stay off
   * until it lands; tapping again withdraws the arrival as before.
   */
  locating?: boolean;
}

export function ArrivedButton({
  onPress,
  arrived = false,
  enabled = true,
  locating = false,
}: ArrivedButtonProps) {
  return (
    <DoctorActionButton
      label={locating ? 'GETTING LOCATION…' : 'ARRIVED'}
      iconName={locating ? 'navigate-outline' : 'location-outline'}
      onPress={onPress}
      active={arrived}
      enabled={enabled}
      variant="outline"
    />
  );
}
