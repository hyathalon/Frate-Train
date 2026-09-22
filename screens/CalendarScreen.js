import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MoveSessionModal from '../components/MoveSessionModal';
import SessionEditModal from '../components/SessionEditModal';
import { colors, radii, spacing } from '../constants/theme';
import { formatDate, toISODateString, todayISODate } from '../utils/date';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SESSION_ROTATION = [
  {
    title: 'HYROX Simulation',
    type: 'Hyrox',
    duration: '65 min',
    exercises: ['SkiErg', 'Sled Push', 'Burpee Broad Jumps', 'Wall Balls'],
  },
  {
    title: 'Strength Session',
    type: 'Strength',
    duration: '50 min',
    exercises: ['Back Squat', 'Bench Press', 'Bent-Over Row'],
  },
  {
    title: 'Easy Run',
    type: 'Running',
    duration: '40 min',
    exercises: ['Warm-Up Jog', 'Steady Run', 'Cool-Down Jog'],
  },
  {
    title: 'Recovery Flow',
    type: 'Recovery',
    duration: '30 min',
    exercises: ['Foam Rolling', 'Mobility Flow', 'Stretching'],
  },
  {
    title: 'Long Run',
    type: 'Running',
    duration: '75 min',
    exercises: ['Warm-Up Jog', 'Long Steady Run', 'Cool-Down Jog'],
  },
];

function isRestDay(date) {
  return date.getDay() === 1; // Monday
}

function buildMonthMatrix(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function buildMockData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const history = {};
  const streaks = {};
  let streak = 0;
  let rotationIndex = 0;

  const cursor = new Date(monthStart);
  while (cursor < today) {
    const iso = toISODateString(cursor);
    if (isRestDay(cursor)) {
      streak = 0;
    } else {
      const template = SESSION_ROTATION[rotationIndex % SESSION_ROTATION.length];
      history[iso] = {
        title: template.title,
        type: template.type,
        duration: template.duration,
        rpe: 6 + (rotationIndex % 4),
        completedCount: 6 + (rotationIndex % 3),
        totalCount: 9,
      };
      streak += 1;
      streaks[iso] = streak;
      rotationIndex += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const schedule = {};
  rotationIndex = 0;
  const futureCursor = new Date(today);
  while (futureCursor <= monthEnd) {
    if (!isRestDay(futureCursor)) {
      const template = SESSION_ROTATION[rotationIndex % SESSION_ROTATION.length];
      schedule[toISODateString(futureCursor)] = {
        title: template.title,
        type: template.type,
        duration: template.duration,
        exercises: [...template.exercises],
      };
      rotationIndex += 1;
    }
    futureCursor.setDate(futureCursor.getDate() + 1);
  }

  return { history, streaks, schedule };
}

const { history, streaks, schedule: initialSchedule } = buildMockData();

export default function CalendarScreen() {
  const router = useRouter();
  const [viewDate] = useState(() => new Date());
  const [schedule, setSchedule] = useState(initialSchedule);
  const [selectedPastDate, setSelectedPastDate] = useState(null);
  const [selectedFutureDate, setSelectedFutureDate] = useState(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const weeks = buildMonthMatrix(viewDate);
  const monthLabel = viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const todayISO = todayISODate();
  const todayDateOnly = new Date();
  todayDateOnly.setHours(0, 0, 0, 0);

  const handleDayPress = (date) => {
    if (!date) return;
    const iso = toISODateString(date);
    if (date < todayDateOnly) {
      setSelectedPastDate(iso);
    } else {
      setSelectedFutureDate(iso);
    }
  };

  const handleStart = () => {
    setSelectedFutureDate(null);
    router.push('/(tabs)/workout');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Calendar</Text>

        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((date, dayIndex) => {
                if (!date) {
                  return <View key={dayIndex} style={styles.dayCell} />;
                }
                const iso = toISODateString(date);
                const isToday = iso === todayISO;
                const isPast = date < todayDateOnly;
                const historyEntry = history[iso];
                const streak = streaks[iso];
                const scheduleEntry = schedule[iso];

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[styles.dayCell, isToday && styles.dayCellToday]}
                    onPress={() => handleDayPress(date)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                      {date.getDate()}
                    </Text>
                    {isPast && historyEntry && (
                      <View style={styles.dayIndicatorRow}>
                        <Text style={styles.tickText}>✓</Text>
                        <Ionicons name="flame" size={9} color={colors.primary} />
                        <Text style={styles.streakDigit}>{streak}</Text>
                      </View>
                    )}
                    {!isPast && scheduleEntry && <View style={styles.scheduledDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <Text style={styles.tickText}>✓</Text>
              <Ionicons name="flame" size={9} color={colors.primary} />
              <Text style={styles.legendText}>Completed + streak</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.scheduledDot} />
              <Text style={styles.legendText}>Scheduled</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedPastDate}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPastDate(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {selectedPastDate && history[selectedPastDate] ? (
              <>
                <Text style={styles.sheetDate}>{formatDate(selectedPastDate)}</Text>
                <View style={styles.sheetTag}>
                  <Text style={styles.sheetTagText}>{history[selectedPastDate].type}</Text>
                </View>
                <Text style={styles.sheetTitle}>{history[selectedPastDate].title}</Text>
                <Text style={styles.sheetMeta}>
                  {history[selectedPastDate].duration} · RPE {history[selectedPastDate].rpe}
                </Text>
                <Text style={styles.sheetMeta}>
                  {history[selectedPastDate].completedCount}/{history[selectedPastDate].totalCount}{' '}
                  exercises completed
                </Text>
                <View style={styles.sheetStreakRow}>
                  <Ionicons name="flame" size={16} color={colors.primary} />
                  <Text style={styles.sheetStreakText}>
                    {streaks[selectedPastDate]}-day streak
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetDate}>
                  {selectedPastDate && formatDate(selectedPastDate)}
                </Text>
                <Text style={styles.sheetTitle}>Rest Day</Text>
                <Text style={styles.sheetMeta}>No workout logged.</Text>
              </>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedPastDate(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedFutureDate}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFutureDate(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {selectedFutureDate && schedule[selectedFutureDate] ? (
              <>
                <Text style={styles.sheetDate}>{formatDate(selectedFutureDate)}</Text>
                <View style={styles.sheetTag}>
                  <Text style={styles.sheetTagText}>{schedule[selectedFutureDate].type}</Text>
                </View>
                <Text style={styles.sheetTitle}>{schedule[selectedFutureDate].title}</Text>
                <Text style={styles.sheetMeta}>{schedule[selectedFutureDate].duration}</Text>

                <TouchableOpacity style={styles.startButton} onPress={handleStart}>
                  <Text style={styles.startButtonText}>Start</Text>
                </TouchableOpacity>
                <View style={styles.secondaryRow}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setMoveModalVisible(true)}
                  >
                    <Text style={styles.secondaryButtonText}>Move</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setEditModalVisible(true)}
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetDate}>
                  {selectedFutureDate && formatDate(selectedFutureDate)}
                </Text>
                <Text style={styles.sheetTitle}>Rest Day</Text>
                <Text style={styles.sheetMeta}>No session scheduled.</Text>
              </>
            )}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedFutureDate(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <MoveSessionModal
        visible={moveModalVisible}
        currentDate={selectedFutureDate ?? todayISO}
        label="Workout"
        onClose={() => setMoveModalVisible(false)}
        onSave={(newDate) => {
          setSchedule((prev) => {
            const next = { ...prev };
            const entry = next[selectedFutureDate];
            delete next[selectedFutureDate];
            if (entry) next[newDate] = entry;
            return next;
          });
          setMoveModalVisible(false);
          setSelectedFutureDate(null);
        }}
      />

      <SessionEditModal
        visible={editModalVisible}
        session={selectedFutureDate ? schedule[selectedFutureDate] : null}
        onClose={() => setEditModalVisible(false)}
        onSave={(updatedSession) => {
          setSchedule((prev) => ({
            ...prev,
            [selectedFutureDate]: { ...prev[selectedFutureDate], ...updatedSession },
          }));
          setEditModalVisible(false);
          setSelectedFutureDate(null);
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
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  monthHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  monthLabel: {
    color: colors.textOnSurface,
    fontSize: 16,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.textOnSurfaceFaint,
    fontSize: 11,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCellToday: {
    borderColor: colors.primary,
  },
  dayNumber: {
    color: colors.textOnSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  dayNumberToday: {
    color: colors.primary,
  },
  dayIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 2,
  },
  tickText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '700',
  },
  streakDigit: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '700',
  },
  scheduledDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 11,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sheetDate: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  sheetTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  sheetTagText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sheetTitle: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  sheetMeta: {
    color: colors.textOnSurfaceMuted,
    fontSize: 14,
  },
  sheetStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  sheetStreakText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  startButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  closeButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButtonText: {
    color: colors.textOnSurface,
    fontWeight: '600',
  },
});
