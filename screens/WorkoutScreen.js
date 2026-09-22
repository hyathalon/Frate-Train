import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../constants/theme';

const session = {
  title: 'HYROX Simulation',
  type: 'Hyrox',
  duration: '65 min',
};

const stations = [
  { id: '1', name: '1km Run', target: 'Race pace' },
  { id: '2', name: 'SkiErg', target: '1000m' },
  { id: '3', name: '1km Run', target: 'Race pace' },
  { id: '4', name: 'Sled Push', target: '50m, 102kg' },
  { id: '5', name: '1km Run', target: 'Race pace' },
  { id: '6', name: 'Sled Pull', target: '50m, 78kg' },
  { id: '7', name: '1km Run', target: 'Race pace' },
  { id: '8', name: 'Burpee Broad Jumps', target: '80m' },
  { id: '9', name: '1km Run', target: 'Race pace' },
  { id: '10', name: 'Rowing', target: '1000m' },
  { id: '11', name: '1km Run', target: 'Race pace' },
  { id: '12', name: 'Farmers Carry', target: '200m, 2x24kg' },
  { id: '13', name: '1km Run', target: 'Race pace' },
  { id: '14', name: 'Sandbag Lunges', target: '100m, 20kg' },
  { id: '15', name: '1km Run', target: 'Race pace' },
  { id: '16', name: 'Wall Balls', target: '100 reps, 6kg' },
];

const rpeOptions = [5, 6, 7, 8, 9, 10];

export default function WorkoutScreen() {
  const [completed, setCompleted] = useState({});
  const [rpe, setRpe] = useState(null);

  const toggleStation = (id) => {
    setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(completed).filter(Boolean).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{session.type}</Text>
        </View>
        <Text style={styles.title}>{session.title}</Text>
        <Text style={styles.subtitle}>
          {session.duration} · {completedCount}/{stations.length} complete
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {stations.map((station, index) => {
          const isDone = !!completed[station.id];
          return (
            <TouchableOpacity
              key={station.id}
              style={[styles.stationRow, isDone && styles.stationRowDone]}
              onPress={() => toggleStation(station.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                {isDone && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.stationInfo}>
                <Text style={[styles.stationName, isDone && styles.stationNameDone]}>
                  {index + 1}. {station.name}
                </Text>
                <Text style={styles.stationTarget}>{station.target}</Text>
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
