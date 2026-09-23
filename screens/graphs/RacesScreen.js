/*
Supabase table needed:

create table if not exists race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text not null, -- 'running' | 'hyrox'
  distance_category text, -- '5K' | '10K' | 'Half Marathon' | 'Marathon' | 'Ultramarathon' (running only)
  finish_time_seconds integer not null,
  avg_run_pace numeric, -- minutes per km, hyrox only
  event_date date not null,
  event_name text,
  created_at timestamptz default now()
);

-- react-native-chart-kit has no combo bar+line chart, so the Hyrox section
-- below renders finish time and avg run pace as two stacked charts instead
-- of one chart with a line overlay.
*/

import { useMemo } from 'react';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { CHART_WIDTH, getChartConfig } from './chartTheme';

const DISTANCE_COLORS = {
  '5K': '#3B82F6',
  '10K': '#10B981',
  'Half Marathon': '#F59E0B',
  Marathon: '#EF4444',
  Ultramarathon: '#8B5CF6',
};

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

// Finish times in seconds, one PB attempt per quarter, generally improving.
const MOCK_RUNNING_PBS = {
  '5K': [1290, 1260, 1235, 1218],
  '10K': [2760, 2700, 2650, 2610],
  'Half Marathon': [6300, 6180, 6090, 6020],
  Marathon: [14400, 14100, 13800, 13650],
  Ultramarathon: [32400, 31800, 31200, 30900],
};

const MOCK_HYROX_RESULTS = [
  { eventName: 'Hyrox Sydney', eventDate: '2026-03-15', finishTimeSeconds: 4680, avgRunPaceMinPerKm: 5.6 },
  { eventName: 'Hyrox Melbourne', eventDate: '2026-05-24', finishTimeSeconds: 4530, avgRunPaceMinPerKm: 5.42 },
  { eventName: 'Hyrox Brisbane', eventDate: '2026-08-09', finishTimeSeconds: 4380, avgRunPaceMinPerKm: 5.3 },
];

// TODO: replace MOCK_RUNNING_PBS with a Supabase query, e.g.:
//   supabase.from('race_results').select('distance_category, finish_time_seconds, event_date')
//     .eq('type', 'running').order('event_date')
//   grouped by distance_category.
// TODO: replace MOCK_HYROX_RESULTS with:
//   supabase.from('race_results').select('event_name, event_date, finish_time_seconds, avg_run_pace')
//     .eq('type', 'hyrox').order('event_date')

function formatClock(totalSeconds) {
  const value = typeof totalSeconds === 'string' ? parseFloat(totalSeconds) : totalSeconds;
  if (Number.isNaN(value)) return String(totalSeconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.round(value % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPace(value) {
  const minutes = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(minutes)) return String(value);
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, '0')}`;
}

export default function RacesScreen() {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const textColor = isDark ? colors.text : colors.textOnSurface;
  const mutedColor = isDark ? colors.textMuted : colors.textOnSurfaceMuted;

  const runningChartConfig = useMemo(
    () => ({
      ...getChartConfig({ cardBg, textColor, gridColor: mutedColor }),
      formatYLabel: formatClock,
    }),
    [cardBg, textColor, mutedColor],
  );

  const hyroxTimeChartConfig = useMemo(
    () => ({
      ...getChartConfig({ cardBg, textColor, gridColor: mutedColor }),
      formatYLabel: formatClock,
    }),
    [cardBg, textColor, mutedColor],
  );

  const hyroxPaceChartConfig = useMemo(
    () => ({
      ...getChartConfig({ cardBg, textColor, gridColor: mutedColor, accent: '#10B981' }),
      formatYLabel: formatPace,
    }),
    [cardBg, textColor, mutedColor],
  );

  const runningPbData = useMemo(
    () => ({
      labels: QUARTER_LABELS,
      datasets: Object.entries(MOCK_RUNNING_PBS).map(([category, times]) => ({
        data: times,
        color: (opacity = 1) => hexToRgba(DISTANCE_COLORS[category], opacity),
        strokeWidth: 2,
      })),
      legend: Object.keys(MOCK_RUNNING_PBS),
    }),
    [],
  );

  const hyroxTimeData = useMemo(
    () => ({
      labels: MOCK_HYROX_RESULTS.map((r) => r.eventName.replace('Hyrox ', '')),
      datasets: [{ data: MOCK_HYROX_RESULTS.map((r) => r.finishTimeSeconds) }],
    }),
    [],
  );

  const hyroxPaceData = useMemo(
    () => ({
      labels: MOCK_HYROX_RESULTS.map((r) => r.eventName.replace('Hyrox ', '')),
      datasets: [
        {
          data: MOCK_HYROX_RESULTS.map((r) => r.avgRunPaceMinPerKm),
          color: () => '#10B981',
          strokeWidth: 2,
        },
      ],
    }),
    [],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Races</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Running Races — PB by Distance</Text>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <LineChart
            data={runningPbData}
            width={CHART_WIDTH}
            height={220}
            chartConfig={runningChartConfig}
            fromZero
            style={styles.chart}
          />
          <View style={styles.legend}>
            {Object.entries(DISTANCE_COLORS).map(([category, color]) => (
              <View key={category} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={[styles.legendText, { color: mutedColor }]}>{category}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Hyrox Results</Text>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardLabel, { color: mutedColor }]}>Total Finish Time</Text>
          <BarChart
            data={hyroxTimeData}
            width={CHART_WIDTH}
            height={200}
            chartConfig={hyroxTimeChartConfig}
            fromZero
            yAxisLabel=""
            yAxisSuffix=""
            style={styles.chart}
          />
        </View>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardLabel, { color: mutedColor }]}>Avg Run Pace (min/km)</Text>
          <LineChart
            data={hyroxPaceData}
            width={CHART_WIDTH}
            height={180}
            chartConfig={hyroxPaceChartConfig}
            withDots
            bezier
            style={styles.chart}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function hexToRgba(hex, opacity = 1) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.xs,
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
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
