import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { formatDate, toISODateString, todayISODate } from '../utils/date';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WORKOUT_TYPES = {
  Strength: '#FF4D1A',
  Power: '#FF8C00',
  Endurance: '#3B82F6',
  'Hyrox Specific': '#EF4444',
  'Running Specific': '#10B981',
  Mobility: '#8B5CF6',
  Rest: '#6B7280',
};

const PRESCRIBED_TEMPLATES = {
  Strength: [
    { name: 'Back Squat', sets: 4, reps: '6-8', rest: '90s' },
    { name: 'Romanian Deadlift', sets: 3, reps: '8-10', rest: '75s' },
    { name: 'Bench Press', sets: 4, reps: '5-6', rest: '90s' },
  ],
  Endurance: [
    { name: 'Steady State Run', sets: 1, reps: '40 min', rest: '-' },
    { name: 'Rowing Intervals', sets: 6, reps: '500m', rest: '90s' },
  ],
  'Hyrox Specific': [
    { name: 'Sled Push', sets: 4, reps: '25m', rest: '90s' },
    { name: 'Wall Balls', sets: 4, reps: '20', rest: '60s' },
    { name: 'Sled Pull', sets: 4, reps: '25m', rest: '90s' },
  ],
  Mobility: [
    { name: 'Hip Flow', sets: 2, reps: '5 min', rest: '-' },
    { name: 'Thoracic Rotations', sets: 2, reps: '10 each side', rest: '30s' },
  ],
};

const STREAK_DAYS = 14;

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `local-${idCounter}`;
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

/** Mock sessions for a handful of days in the current real-world month. */
function buildMockSessions() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const sample = [
    { day: 3, type: 'Strength' },
    { day: 8, type: 'Endurance' },
    { day: 14, type: 'Hyrox Specific' },
    { day: 21, type: 'Mobility' },
  ];

  const sessions = {};
  sample.forEach(({ day, type }) => {
    const clampedDay = Math.min(day, daysInMonth);
    const iso = toISODateString(new Date(year, month, clampedDay));
    sessions[iso] = {
      type,
      prescribed: PRESCRIBED_TEMPLATES[type] ?? [],
    };
  });
  return sessions;
}

function createBlankExercise() {
  return {
    id: generateId(),
    name: '',
    sets: [{ id: generateId(), reps: '', weight: '', comment: '' }],
  };
}

function DaySheet({ visible, date, session, savedExercises, onClose, onSave, colors, styles }) {
  const [exercises, setExercises] = useState([]);
  const [weightUnit, setWeightUnit] = useState('kg');
  const [prescribedExpanded, setPrescribedExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      setExercises(savedExercises ?? []);
      setPrescribedExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, date]);

  const updateExerciseName = (exerciseId, name) => {
    setExercises((prev) => prev.map((ex) => (ex.id === exerciseId ? { ...ex, name } : ex)));
  };

  const updateSetField = (exerciseId, setId, field, value) => {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exerciseId
          ? ex
          : { ...ex, sets: ex.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)) }
      )
    );
  };

  const addSet = (exerciseId) => {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exerciseId
          ? ex
          : { ...ex, sets: [...ex.sets, { id: generateId(), reps: '', weight: '', comment: '' }] }
      )
    );
  };

  const addExercise = () => {
    setExercises((prev) => [...prev, createBlankExercise()]);
  };

  const prescribed = session?.prescribed ?? [];
  const typeColor = session ? WORKOUT_TYPES[session.type] : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetDateLabel}>{date ? formatDate(date) : ''}</Text>
            {session && (
              <View style={[styles.sheetTypeTag, { backgroundColor: `${typeColor}22` }]}>
                <View style={[styles.sheetTypeDot, { backgroundColor: typeColor }]} />
                <Text style={[styles.sheetTypeText, { color: typeColor }]}>{session.type}</Text>
              </View>
            )}

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Actual Workout</Text>
                <View style={styles.unitToggle}>
                  {['kg', 'lbs'].map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.unitOption, weightUnit === unit && styles.unitOptionActive]}
                      onPress={() => setWeightUnit(unit)}
                    >
                      <Text
                        style={[
                          styles.unitOptionText,
                          weightUnit === unit && styles.unitOptionTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {exercises.length === 0 && (
                <Text style={styles.emptyText}>
                  No exercises logged yet — tap &quot;Add exercise&quot; to start.
                </Text>
              )}

              {exercises.map((exercise) => (
                <View key={exercise.id} style={styles.exerciseCard}>
                  <TextInput
                    style={styles.exerciseNameInput}
                    placeholder="Exercise name"
                    placeholderTextColor={colors.textOnSurfaceFaint}
                    value={exercise.name}
                    onChangeText={(text) => updateExerciseName(exercise.id, text)}
                  />

                  <View style={styles.setHeaderRow}>
                    <Text style={[styles.setHeaderCell, styles.setNumberCol]}>Set</Text>
                    <Text style={[styles.setHeaderCell, styles.setInputCol]}>Reps</Text>
                    <Text style={[styles.setHeaderCell, styles.setInputCol]}>
                      Weight ({weightUnit})
                    </Text>
                  </View>

                  {exercise.sets.map((set, index) => (
                    <View key={set.id} style={styles.setRow}>
                      <View style={styles.setRowTop}>
                        <Text style={[styles.setNumberText, styles.setNumberCol]}>{index + 1}</Text>
                        <TextInput
                          style={[styles.setInput, styles.setInputCol]}
                          placeholder="0"
                          placeholderTextColor={colors.textOnSurfaceFaint}
                          keyboardType="numeric"
                          value={set.reps}
                          onChangeText={(text) => updateSetField(exercise.id, set.id, 'reps', text)}
                        />
                        <TextInput
                          style={[styles.setInput, styles.setInputCol]}
                          placeholder="0"
                          placeholderTextColor={colors.textOnSurfaceFaint}
                          keyboardType="numeric"
                          value={set.weight}
                          onChangeText={(text) =>
                            updateSetField(exercise.id, set.id, 'weight', text)
                          }
                        />
                      </View>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Comment (optional)"
                        placeholderTextColor={colors.textOnSurfaceFaint}
                        value={set.comment}
                        onChangeText={(text) =>
                          updateSetField(exercise.id, set.id, 'comment', text)
                        }
                      />
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addSetButton} onPress={() => addSet(exercise.id)}>
                    <Ionicons name="add" size={14} color={colors.primary} />
                    <Text style={styles.addSetButtonText}>Add set</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addExerciseButton} onPress={addExercise}>
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.addExerciseButtonText}>Add exercise</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.prescribedHeader}
                onPress={() => setPrescribedExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionTitleSecondary}>Prescribed Workout</Text>
                <Ionicons
                  name={prescribedExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textOnSurfaceMuted}
                />
              </TouchableOpacity>

              {prescribedExpanded && (
                <View style={styles.prescribedList}>
                  {prescribed.length === 0 ? (
                    <Text style={styles.emptyText}>No prescribed workout for this day.</Text>
                  ) : (
                    prescribed.map((item, index) => (
                      <View key={index} style={styles.prescribedRow}>
                        <Text style={styles.prescribedName}>{item.name}</Text>
                        <Text style={styles.prescribedMeta}>
                          {item.sets} × {item.reps} · rest {item.rest}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => onSave(exercises)}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [sessions] = useState(buildMockSessions);
  const [actualLogs, setActualLogs] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);

  const weeks = useMemo(() => buildMonthMatrix(viewDate), [viewDate]);
  const monthLabel = viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const todayISO = todayISODate();

  const goToPrevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goToNextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const handleDayPress = (date) => setSelectedDate(toISODateString(date));

  const handleSaveActual = (exercises) => {
    setActualLogs((prev) => ({ ...prev, [selectedDate]: exercises }));
    setSelectedDate(null);
  };

  const selectedSession = selectedDate ? sessions[selectedDate] : null;
  const selectedExercises = selectedDate ? actualLogs[selectedDate] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Calendar</Text>
          <View style={styles.streakPill}>
            <Text style={styles.streakText}>🔥 {STREAK_DAYS} day streak</Text>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={goToPrevMonth} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.textOnSurface} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={goToNextMonth} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={colors.textOnSurface} />
            </TouchableOpacity>
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
                if (!date) return <View key={dayIndex} style={styles.dayCell} />;
                const iso = toISODateString(date);
                const isToday = iso === todayISO;
                const session = sessions[iso];
                const dotColor = session ? WORKOUT_TYPES[session.type] : null;

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
                    {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.legendWrap}>
            {Object.entries(WORKOUT_TYPES).map(([type, color]) => (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{type}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <DaySheet
        visible={!!selectedDate}
        date={selectedDate}
        session={selectedSession}
        savedExercises={selectedExercises}
        colors={colors}
        styles={styles}
        onClose={() => setSelectedDate(null)}
        onSave={handleSaveActual}
      />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  streakPill: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  streakText: {
    color: colors.primary,
    fontSize: 13,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 11,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    maxHeight: '85%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetDateLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  sheetTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  sheetTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetTypeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sheetScroll: {
    marginTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textOnSurface,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitleSecondary: {
    color: colors.textOnSurfaceMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    padding: 2,
  },
  unitOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  unitOptionActive: {
    backgroundColor: colors.primary,
  },
  unitOptionText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  unitOptionTextActive: {
    color: '#FFFFFF',
  },
  emptyText: {
    color: colors.textOnSurfaceFaint,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  exerciseCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  exerciseNameInput: {
    color: colors.textOnSurface,
    fontSize: 15,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  setHeaderRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  setHeaderCell: {
    color: colors.textOnSurfaceFaint,
    fontSize: 11,
    fontWeight: '700',
  },
  setNumberCol: {
    width: 28,
  },
  setInputCol: {
    flex: 1,
  },
  setRow: {
    gap: 4,
  },
  setRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  setNumberText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  setInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.textOnSurface,
    fontSize: 13,
  },
  commentInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.textOnSurface,
    fontSize: 12,
    marginLeft: 32,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  addSetButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  addExerciseButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  prescribedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  prescribedList: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  prescribedRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prescribedName: {
    color: colors.textOnSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  prescribedMeta: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textOnSurface,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  });
}
