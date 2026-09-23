/*
Supabase table needed:

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  workout_type text not null, -- 'Strength' | 'Power' | 'Endurance' | 'Hyrox Specific' | 'Running Specific' | 'Mobility'
  logged_date date not null,
  exercise_name text,
  sets integer,
  reps integer,
  weight_kg numeric,
  created_at timestamptz default now()
);

-- Weekly load = sum(sets * reps) grouped by ISO week, using the week's
-- most-logged workout_type to colour that week's bar.
*/

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { CHART_WIDTH, getChartConfig, hexToRgba } from './chartTheme';

const WORKOUT_TYPE_COLORS = {
  Strength: '#FF4D1A',
  Power: '#FF8C00',
  Endurance: '#3B82F6',
  'Hyrox Specific': '#EF4444',
  'Running Specific': '#10B981',
  Mobility: '#8B5CF6',
};

const MOCK_WEEKLY_LOAD = [
  { week: 'W1', type: 'Strength', load: 380 },
  { week: 'W2', type: 'Endurance', load: 240 },
  { week: 'W3', type: 'Hyrox Specific', load: 410 },
  { week: 'W4', type: 'Strength', load: 420 },
  { week: 'W5', type: 'Mobility', load: 150 },
  { week: 'W6', type: 'Power', load: 300 },
  { week: 'W7', type: 'Running Specific', load: 260 },
  { week: 'W8', type: 'Strength', load: 450 },
  { week: 'W9', type: 'Hyrox Specific', load: 480 },
  { week: 'W10', type: 'Endurance', load: 290 },
  { week: 'W11', type: 'Strength', load: 470 },
  { week: 'W12', type: 'Power', load: 320 },
];

// TODO: replace MOCK_WEEKLY_LOAD with a Supabase query, e.g.:
//   supabase.from('workout_logs')
//     .select('workout_type, sets, reps, logged_date')
//     .gte('logged_date', twelveWeeksAgoISO)
//   then group rows by ISO week, summing sets * reps per week and picking
//   the week's most frequent workout_type for the bar colour.

export default function LoadScreen() {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const textColor = isDark ? colors.text : colors.textOnSurface;
  const mutedColor = isDark ? colors.textMuted : colors.textOnSurfaceMuted;

  const chartConfig = useMemo(
    () => getChartConfig({ cardBg, textColor, gridColor: mutedColor }),
    [cardBg, textColor, mutedColor],
  );

  const chartData = useMemo(
    () => ({
      labels: MOCK_WEEKLY_LOAD.map((w) => w.week),
      datasets: [
        {
          data: MOCK_WEEKLY_LOAD.map((w) => w.load),
          colors: MOCK_WEEKLY_LOAD.map(
            (w) =>
              (opacity = 1) =>
                hexToRgba(WORKOUT_TYPE_COLORS[w.type], opacity),
          ),
        },
      ],
    }),
    [],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Weekly Training Load</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Total sets × reps by week, last 12 weeks
        </Text>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <BarChart
            data={chartData}
            width={CHART_WIDTH}
            height={220}
            chartConfig={chartConfig}
            fromZero
            withCustomBarColorFromData
            flatColor
            showValuesOnTopOfBars
            yAxisLabel=""
            yAxisSuffix=""
            style={styles.chart}
          />
        </View>

        <View style={styles.legend}>
          {Object.entries(WORKOUT_TYPE_COLORS).map(([type, color]) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>{type}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
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
  card: {
    borderRadius: 20,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  chart: {
    borderRadius: 16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
