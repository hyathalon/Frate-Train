/*
Supabase tables needed:

create table if not exists strength_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  exercise_name text not null,
  logged_date date not null,
  weight_kg numeric not null,
  reps integer not null,
  created_at timestamptz default now()
);

create table if not exists body_weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  logged_date date not null,
  weight_kg numeric not null,
  created_at timestamptz default now()
);

-- Estimated 1RM = weight_kg * (1 + reps / 30), plotted per exercise over time.
*/

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { LineChart } from 'react-native-chart-kit';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import BodyCheckChart from './BodyCheckChart';
import { CHART_WIDTH, getChartConfig } from './chartTheme';

const KG_TO_LBS = 2.20462;

const EXERCISE_LOGS = {
  'Back Squat': [
    { date: '2026-07-01', weightKg: 100, reps: 5 },
    { date: '2026-07-15', weightKg: 102.5, reps: 5 },
    { date: '2026-07-29', weightKg: 105, reps: 4 },
    { date: '2026-08-12', weightKg: 110, reps: 4 },
    { date: '2026-08-26', weightKg: 112.5, reps: 3 },
    { date: '2026-09-09', weightKg: 115, reps: 3 },
  ],
  Deadlift: [
    { date: '2026-07-01', weightKg: 130, reps: 5 },
    { date: '2026-07-15', weightKg: 135, reps: 4 },
    { date: '2026-07-29', weightKg: 137.5, reps: 4 },
    { date: '2026-08-12', weightKg: 140, reps: 3 },
    { date: '2026-08-26', weightKg: 142.5, reps: 3 },
    { date: '2026-09-09', weightKg: 147.5, reps: 2 },
  ],
  'Bench Press': [
    { date: '2026-07-01', weightKg: 75, reps: 6 },
    { date: '2026-07-15', weightKg: 77.5, reps: 5 },
    { date: '2026-07-29', weightKg: 80, reps: 5 },
    { date: '2026-08-12', weightKg: 80, reps: 4 },
    { date: '2026-08-26', weightKg: 82.5, reps: 4 },
    { date: '2026-09-09', weightKg: 85, reps: 3 },
  ],
  'Overhead Press': [
    { date: '2026-07-01', weightKg: 45, reps: 6 },
    { date: '2026-07-15', weightKg: 47.5, reps: 5 },
    { date: '2026-07-29', weightKg: 47.5, reps: 5 },
    { date: '2026-08-12', weightKg: 50, reps: 4 },
    { date: '2026-08-26', weightKg: 50, reps: 4 },
    { date: '2026-09-09', weightKg: 52.5, reps: 3 },
  ],
};

const MOCK_BODY_WEIGHT_KG = [82.4, 82.1, 81.8, 81.9, 81.5, 81.2];

const EXERCISE_NAMES = Object.keys(EXERCISE_LOGS);

// TODO: replace EXERCISE_LOGS with a Supabase query, e.g.:
//   supabase.from('strength_logs').select('logged_date, weight_kg, reps')
//     .eq('exercise_name', selectedExercise).order('logged_date')
// and MOCK_BODY_WEIGHT_KG with:
//   supabase.from('body_weight_logs').select('logged_date, weight_kg')
//     .gte('logged_date', sameRangeStart).order('logged_date')

function estimatedOneRepMax(weightKg, reps) {
  return weightKg * (1 + reps / 30);
}

function formatShortDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function StrengthScreen() {
  const { colors, isDark } = useTheme();
  const [weightUnit] = useWeightUnit();
  const [selectedExercise, setSelectedExercise] = useState(EXERCISE_NAMES[0]);
  const [pickerVisible, setPickerVisible] = useState(false);

  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const textColor = isDark ? colors.text : colors.textOnSurface;
  const mutedColor = isDark ? colors.textMuted : colors.textOnSurfaceMuted;

  const chartConfig = useMemo(
    () => getChartConfig({ cardBg, textColor, gridColor: mutedColor }),
    [cardBg, textColor, mutedColor],
  );

  const logs = EXERCISE_LOGS[selectedExercise];

  const oneRepMaxData = useMemo(() => {
    const toDisplayUnit = (kg) => (weightUnit === 'lbs' ? kg * KG_TO_LBS : kg);
    return {
      labels: logs.map((log) => formatShortDate(log.date)),
      datasets: [
        {
          data: logs.map((log) => Math.round(toDisplayUnit(estimatedOneRepMax(log.weightKg, log.reps)))),
          strokeWidth: 2,
        },
      ],
    };
  }, [logs, weightUnit]);

  const bodyWeightData = useMemo(
    () => MOCK_BODY_WEIGHT_KG.map((kg) => Math.round((weightUnit === 'lbs' ? kg * KG_TO_LBS : kg) * 10) / 10),
    [weightUnit],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Strength Progress</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Estimated 1RM = weight × (1 + reps / 30)
        </Text>

        <TouchableOpacity
          style={[styles.dropdown, { backgroundColor: cardBg }]}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.dropdownText, { color: textColor }]}>{selectedExercise}</Text>
          <Ionicons name="chevron-down" size={18} color={mutedColor} />
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardLabel, { color: mutedColor }]}>
            Estimated 1RM ({weightUnit})
          </Text>
          <LineChart
            data={oneRepMaxData}
            width={CHART_WIDTH}
            height={200}
            chartConfig={chartConfig}
            bezier
            fromZero
            style={styles.chart}
          />
        </View>

        <BodyCheckChart
          labels={oneRepMaxData.labels}
          data={bodyWeightData}
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        >
          <View style={[styles.pickerSheet, { backgroundColor: cardBg }]}>
            {EXERCISE_NAMES.map((name) => (
              <TouchableOpacity
                key={name}
                style={styles.pickerRow}
                onPress={() => {
                  setSelectedExercise(name);
                  setPickerVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerRowText,
                    { color: name === selectedExercise ? colors.primary : textColor },
                  ]}
                >
                  {name}
                </Text>
                {name === selectedExercise && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: -spacing.sm,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dropdownText: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: 20,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chart: {
    borderRadius: 16,
    marginLeft: -spacing.md,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerSheet: {
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pickerRowText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
