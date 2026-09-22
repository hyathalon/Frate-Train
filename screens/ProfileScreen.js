import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../constants/theme';

const athlete = {
  name: 'Sam Carter',
  coach: 'Hyathlon Performance',
  division: 'Men’s Open',
};

const personalBests = [
  { label: 'HYROX', value: '1:12:04' },
  { label: '5K', value: '18:42' },
  { label: '10K', value: '39:10' },
  { label: 'Half Marathon', value: '1:26:55' },
];

const settingsItems = [
  { id: 'edit', label: 'Edit Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'units', label: 'Units — Metric' },
  { id: 'coach', label: 'Message Coach' },
  { id: 'logout', label: 'Log Out' },
];

export default function ProfileScreen() {
  const initials = athlete.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{athlete.name}</Text>
          <Text style={styles.coach}>Coached by {athlete.coach}</Text>
          <View style={styles.divisionTag}>
            <Text style={styles.divisionTagText}>{athlete.division}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Personal Bests</Text>
        <View style={styles.pbGrid}>
          {personalBests.map((pb) => (
            <View key={pb.label} style={styles.pbCard}>
              <Text style={styles.pbValue}>{pb.value}</Text>
              <Text style={styles.pbLabel}>{pb.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsList}>
          {settingsItems.map((item) => (
            <TouchableOpacity key={item.id} style={styles.settingsRow}>
              <Text
                style={[
                  styles.settingsLabel,
                  item.id === 'logout' && styles.settingsLabelDanger,
                ]}
              >
                {item.label}
              </Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  coach: {
    color: colors.textMuted,
    fontSize: 13,
  },
  divisionTag: {
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  divisionTagText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  pbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pbCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  pbValue: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  pbLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
  },
  settingsList: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsLabel: {
    color: colors.textOnSurface,
    fontSize: 15,
  },
  settingsLabelDanger: {
    color: colors.primary,
  },
  chevron: {
    color: colors.textOnSurfaceFaint,
    fontSize: 14,
  },
});
