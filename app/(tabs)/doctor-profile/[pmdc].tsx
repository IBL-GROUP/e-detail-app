import { useLocalSearchParams } from 'expo-router';
import DoctorProfileScreen from '@/views/doctor-profiles/DoctorProfileScreen';

/**
 * One assigned doctor's profile, by PMDC number — the captured profile, or the
 * capture form when there is none yet. Everything is read from the cached
 * assigned list and the device queue, so it works offline.
 */
export default function DoctorProfileRoute() {
  const params = useLocalSearchParams<{ pmdc: string }>();
  const pmdc = Array.isArray(params.pmdc) ? params.pmdc[0] : params.pmdc;
  if (!pmdc) return null;
  // Keyed by doctor, so moving from one doctor to the next starts a fresh form.
  return <DoctorProfileScreen key={pmdc} pmdc={pmdc} />;
}
