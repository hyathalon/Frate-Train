import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MoveSessionModal from '../components/MoveSessionModal';
import RaceEditModal from '../components/RaceEditModal';
import SessionEditModal from '../components/SessionEditModal';
import { colors, radii, spacing } from '../constants/theme';
import { getBrandName, useAthlete } from '../context/AthleteContext';
import { daysUntil, formatRaceDate, useRace } from '../context/RaceContext';
import { formatDate, todayISODate } from '../utils/date';

const athlete = {
  name: 'Sam',
};

const initialSession = {
  title: 'HYROX Simulation',
  type: 'Hyrox',
  duration: '65 min',
  date: todayISODate(),
  exercises: [
    '1km Run',
    'SkiErg',
    'Sled Push',
    'Sled Pull',
    'Burpee Broad Jumps',
    'Rowing',
    'Farmers Carry',
    'Sandbag Lunges',
    'Wall Balls',
  ],
};

const weeklyStats = [
  { label: 'Weekly km', value: '38.4' },
  { label: 'Sessions', value: '4/5' },
  { label: 'Avg RPE', value: '7.2' },
  { label: 'Streak', value: '6 wks' },
];

const lastRestDay = 'Monday';

const motivationalPhrases = [
  'Growth comes from recovery.',
  'Consistency beats intensity.',
  'Every session builds the athlete.',
  'Rest is part of the plan.',
  'Trust the process, earn the result.',
  'Small gains, big outcomes.',
  'Show up. Do the work. Repeat.',
  'Recovery is where champions are made.',
  'One session at a time.',
  'Earn your rest. Then use it.',
];

function getDailyPhrase() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
  return motivationalPhrases[dayOfYear % motivationalPhrases.length];
}

function summarizeExercises(exercises) {
  if (exercises.length <= 3) return exercises.join(', ');
  return `${exercises.slice(0, 3).join(', ')} +${exercises.length - 3} more`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { athleteType } = useAthlete();
  const { race, setRace } = useRace();
  const [raceModalVisible, setRaceModalVisible] = useState(false);
  const [session, setSession] = useState(initialSession);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [dailyPhrase] = useState(getDailyPhrase);

  const isToday = session.date === todayISODate();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.logo}>{getBrandName(athleteType)}</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.greeting}>Hey {athlete.name}, let's train.</Text>
        </View>

        <TouchableOpacity
          style={styles.raceCard}
          onPress={() => setRaceModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.raceLabel}>NEXT RACE</Text>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.raceMeta}>
            {formatRaceDate(race.date)} · {race.location}
          </Text>
          <Text style={styles.raceDays}>{Math.max(daysUntil(race.date), 0)} days to go</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Today's Session</Text>
        <View style={styles.sessionCard}>
          <View style={styles.sessionCardHeader}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{session.type}</Text>
            </View>
            <Text style={styles.duration}>{session.duration}</Text>
          </View>
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <Text style={styles.sessionDetail}>{summarizeExercises(session.exercises)}</Text>
          <Text style={styles.sessionSchedule}>
            Scheduled: {isToday ? 'Today' : formatDate(session.date)}
          </Text>

          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push('/(tabs)/workout')}
          >
            <Text style={styles.startButtonText}>Start Session</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActionsRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setMoveModalVisible(true)}
            >
              <Text style={styles.secondaryButtonText}>Move Session</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setEditModalVisible(true)}
            >
              <Text style={styles.secondaryButtonText}>Edit Session</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.weekCard}>
          <View style={styles.statsGrid}>
            {weeklyStats.map((stat) => (
              <View key={stat.label} style={styles.statTile}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.weekDivider} />

          <View style={styles.weekInfoRow}>
            <Ionicons name="moon" size={16} color={colors.textOnSurfaceMuted} />
            <Text style={styles.restText}>Last rest: {lastRestDay}</Text>
          </View>

          <View style={styles.weekInfoRow}>
            <Ionicons name="flash" size={16} color={colors.primary} />
            <Text style={styles.motivationText}>{dailyPhrase}</Text>
          </View>
        </View>

        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/(tabs)/rehab')}>
            <View style={styles.quickLinkRow}>
              <Ionicons name="body" size={20} color={colors.primary} />
              <View style={styles.quickLinkTextGroup}>
                <Text style={styles.quickLinkTitle}>Body Check</Text>
                <Text style={styles.quickLinkSubtitle}>
                  Log any niggles, hot spots or areas of awareness.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.quickLinkTitle}>Sync devices</Text>
            <Text style={styles.quickLinkSubtitle}>Strava last synced 2h ago</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <RaceEditModal
        visible={raceModalVisible}
        race={race}
        onClose={() => setRaceModalVisible(false)}
        onSave={(updatedRace) => {
          setRace(updatedRace);
          setRaceModalVisible(false);
        }}
      />

      <MoveSessionModal
        visible={moveModalVisible}
        currentDate={session.date}
        onClose={() => setMoveModalVisible(false)}
        onSave={(newDate) => {
          setSession((prev) => ({ ...prev, date: newDate }));
          setMoveModalVisible(false);
        }}
      />

      <SessionEditModal
        visible={editModalVisible}
        session={session}
        onClose={() => setEditModalVisible(false)}
        onSave={(updatedSession) => {
          setSession((prev) => ({ ...prev, ...updatedSession }));
          setEditModalVisible(false);
        }}
      />
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
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    color: colors.textOnSurfaceMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  raceName: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  raceMeta: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
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
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
  sessionTitle: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  sessionDetail: {
    color: colors.textOnSurfaceMuted,
    fontSize: 14,
  },
  sessionSchedule: {
    color: colors.textOnSurfaceFaint,
    fontSize: 12,
    fontWeight: '600',
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
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
  },
  statValue: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
  },
  weekDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  weekInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  restText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
  motivationText: {
    flex: 1,
    color: colors.textOnSurface,
    fontSize: 13,
    fontWeight: '600',
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
  quickLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickLinkTextGroup: {
    flex: 1,
    gap: 2,
  },
  quickLinkTitle: {
    color: colors.textOnSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  quickLinkSubtitle: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
});
