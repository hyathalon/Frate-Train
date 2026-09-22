import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ModifyWorkoutModal from '../components/ModifyWorkoutModal';
import MoveSessionModal from '../components/MoveSessionModal';
import QuickWorkoutModal from '../components/QuickWorkoutModal';
import { colors, radii, spacing } from '../constants/theme';
import { formatDate, todayISODate } from '../utils/date';
import { generateQuickWorkout } from '../utils/workoutGenerator';

const initialWorkout = {
  title: 'HYROX Simulation',
  type: 'Hyrox',
  duration: '65 min',
  date: todayISODate(),
  exercises: [
    { id: '1', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '2', name: 'SkiErg', sets: 1, reps: '1000m' },
    { id: '3', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '4', name: 'Sled Push', sets: 1, reps: '50m, 102kg' },
    { id: '5', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '6', name: 'Sled Pull', sets: 1, reps: '50m, 78kg' },
    { id: '7', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '8', name: 'Burpee Broad Jumps', sets: 1, reps: '80m' },
    { id: '9', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '10', name: 'Rowing', sets: 1, reps: '1000m' },
    { id: '11', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '12', name: 'Farmers Carry', sets: 1, reps: '200m, 2x24kg' },
    { id: '13', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '14', name: 'Sandbag Lunges', sets: 1, reps: '100m, 20kg' },
    { id: '15', name: '1km Run', sets: 1, reps: 'Race pace' },
    { id: '16', name: 'Wall Balls', sets: 1, reps: '100 reps, 6kg' },
  ],
};

const rpeOptions = [5, 6, 7, 8, 9, 10];

function formatSetsReps(sets, reps) {
  return sets > 1 ? `${sets} × ${reps}` : reps;
}

export default function WorkoutScreen() {
  const [workout, setWorkout] = useState(initialWorkout);
  const [completed, setCompleted] = useState({});
  const [rpe, setRpe] = useState(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [modifyModalVisible, setModifyModalVisible] = useState(false);
  const [quickModalVisible, setQuickModalVisible] = useState(false);

  const toggleExercise = (id) => {
    setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(completed).filter(Boolean).length;
  const isToday = workout.date === todayISODate();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{workout.type}</Text>
        </View>
        <Text style={styles.title}>{workout.title}</Text>
        <Text style={styles.subtitle}>
          {workout.duration} · {completedCount}/{workout.exercises.length} complete
        </Text>
        <Text style={styles.schedule}>
          Scheduled: {isToday ? 'Today' : formatDate(workout.date)}
        </Text>

        <View style={styles.topActionsRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setMoveModalVisible(true)}
          >
            <Text style={styles.secondaryButtonText}>Move Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setModifyModalVisible(true)}
          >
            <Text style={styles.secondaryButtonText}>Modify Workout</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.quickButton} onPress={() => setQuickModalVisible(true)}>
          <Text style={styles.quickButtonText}>Quick Workout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {workout.exercises.map((exercise, index) => {
          const isDone = !!completed[exercise.id];
          return (
            <TouchableOpacity
              key={exercise.id}
              style={[styles.stationRow, isDone && styles.stationRowDone]}
              onPress={() => toggleExercise(exercise.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                {isDone && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.stationInfo}>
                <Text style={[styles.stationName, isDone && styles.stationNameDone]}>
                  {index + 1}. {exercise.name}
                </Text>
                <Text style={styles.stationTarget}>
                  {formatSetsReps(exercise.sets, exercise.reps)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionTitle}>Session RPE</Text>
        <View style={styles.rpeRow}>
          {rpeOptions.map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.rpeChip, rpe === value && styles.rpeChipActive]}
              onPress={() => setRpe(value)}
            >
              <Text style={[styles.rpeChipText, rpe === value && styles.rpeChipTextActive]}>
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.completeButton}>
          <Text style={styles.completeButtonText}>Mark Session Complete</Text>
        </TouchableOpacity>
      </ScrollView>

      <MoveSessionModal
        visible={moveModalVisible}
        currentDate={workout.date}
        label="Workout"
        onClose={() => setMoveModalVisible(false)}
        onSave={(newDate) => {
          setWorkout((prev) => ({ ...prev, date: newDate }));
          setMoveModalVisible(false);
        }}
      />

      <ModifyWorkoutModal
        visible={modifyModalVisible}
        exercises={workout.exercises}
        onClose={() => setModifyModalVisible(false)}
        onSave={(updatedExercises) => {
          setWorkout((prev) => ({ ...prev, exercises: updatedExercises }));
          setModifyModalVisible(false);
        }}
      />

      <QuickWorkoutModal
        visible={quickModalVisible}
        onClose={() => setQuickModalVisible(false)}
        onGenerate={(answers) => {
          setWorkout(generateQuickWorkout(answers));
          setCompleted({});
          setRpe(null);
          setQuickModalVisible(false);
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
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  tag: {
    alignSelf: 'flex-start',
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
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  schedule: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  topActionsRow: {
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
  quickButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primaryMuted,
  },
  quickButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  stationRowDone: {
    borderColor: colors.success,
    backgroundColor: colors.successMuted,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  checkmark: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  stationInfo: {
    flex: 1,
    gap: 2,
  },
  stationName: {
    color: colors.textOnSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  stationNameDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  stationTarget: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  rpeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rpeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rpeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  rpeChipText: {
    color: colors.textOnSurfaceMuted,
    fontWeight: '600',
  },
  rpeChipTextActive: {
    color: colors.primary,
  },
  completeButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  completeButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
