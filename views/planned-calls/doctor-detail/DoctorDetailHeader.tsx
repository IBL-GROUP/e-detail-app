import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useScreenTopInset } from '@/components/ui/ScreenTopInset';

interface DoctorDetailHeaderProps {
  name: string;
  specialty: string;
  /** Where the back chevron goes. Falls back to history when not given. */
  onBack?: () => void;
}

export function DoctorDetailHeader({ name, specialty, onBack }: DoctorDetailHeaderProps) {
  const topInset = useScreenTopInset();
  return (
    <View style={styles.wrapper}>
      <View style={{ paddingTop: topInset }}>
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack ?? (() => router.back())}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textOnDark} />
          </Pressable>
        </View>
      </View>

      <View style={styles.profileRow}>
        <View style={styles.avatarCard}>
          <Ionicons name="pulse-outline" size={28} color={Colors.primary} />
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.specialty}>{specialty}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.secondary,
    paddingBottom: 50,
  },
  topRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  avatarCard: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  nameBlock: {
    alignItems: 'center',
    gap: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textOnDark,
    textAlign: 'center',
  },
  specialty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    textAlign: 'center',
  },
});
