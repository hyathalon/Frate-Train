import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../constants/theme';

const athlete = {
  name: 'Sam',
};

const nextRace = {
  name: 'HYROX Melbourne',
  daysOut: 42,
};

const todaySession = {
  title: 'HYROX Simulation',
  type: 'Hyrox',
  duration: '65 min',
  detail: '1km run + 8 stations, race pace',
};

const weeklyStats = [
  { label: 'Weekly km', value: '38.4' },
  { label: 'Sessions', value: '4/5' },
  { label: 'Avg RPE', value: '7.2' },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.brand}>HYATHLON PERFORMANCE</Text>
          <Text style={styles.greeting}>Hey {athlete.name}, let's train.</Text>
        </View>

        <View style={styles.raceCard}>
          <Text style={styles.raceLabel}>NEXT RACE</Text>
          <Text style={styles.raceName}>{nextRace.name}</Text>
          <Text style={styles.raceDays}>{nextRace.daysOut} days to go</Text>
        </View>

        <Text style={styles.sectionTitle}>Today's Session</Text>
        <View style={styles.sessionCard}>
          <View style={styles.sessionCardHeader}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{todaySession.type}</Text>
            </View>
            <Text style={styles.duration}>{todaySession.duration}</Text>
          </View>
          <Text style={styles.sessionTitle}>{todaySession.title}</Text>
          <Text style={styles.sessionDetail}>{todaySession.detail}</Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push('/(tabs)/workout')}
          >
            <Text style={styles.startButtonText}>Start Session</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.statsRow}>
          {weeklyStats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/(tabs)/rehab')}>
            <Text style={styles.quickLinkTitle}>Rehab check-in</Text>
            <Text style={styles.quickLinkSubtitle}>Log today's mobility & niggles</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/(tabs)/integrations')}
          >
            <Text style={styles.quickLinkTitle}>Sync devices</Text>
            <Text style={styles.quickLinkSubtitle}>Strava last synced 2h ago</Text>
          </TouchableOpacity>
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
  header: {
    gap: spacing.xs,
  },
  brand: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  greeting: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  raceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  raceLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  raceName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  raceDays: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tag: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  tagText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  duration: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  sessionDetail: {
    color: colors.textMuted,
    fontSize: 14,
  },
  startButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  quickLinks: {
    gap: spacing.sm,
  },
  quickLink: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  quickLinkTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  quickLinkSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
