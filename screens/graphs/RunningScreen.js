/*
Supabase tables needed:

create table if not exists running_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  logged_date date not null,
  distance_km numeric not null,
  duration_seconds integer,
  created_at timestamptz default now()
);

-- Also reads race_results (see RacesScreen.js) filtered to type = 'hyrox'
-- for the avg_run_pace-per-event chart:
create table if not exists race_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text not null, -- 'running' | 'hyrox'
  distance_category text, -- '5K' | '10K' | 'Half Marathon' | 'Marathon' | 'Ultramarathon' (running only)
  finish_time_seconds integer,
  avg_run_pace numeric, -- minutes per km, hyrox only, logged manually after each event
  event_date date not null,
  event_name text,
  created_at timestamptz default now()
);
*/

import { useMemo } from 'react';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import BodyCheckChart from './BodyCheckChart';
import { CHART_WIDTH, getChartConfig } from './chartTheme';

const RUNNING_COLOR = '#10B981';

const MOCK_WEEKLY_VOLUME_KM = [22, 26, 18, 30, 34, 28, 20, 32, 36, 30, 25, 38];
const WEEK_LABELS = MOCK_WEEKLY_VOLUME_KM.map((_, index) => `W${index + 1}`);

const MOCK_HYROX_EVENTS = [
  { eventName: 'Hyrox Sydney', eventDate: '2026-03-15', avgRunPaceMinPerKm: 5.6 },
  { eventName: 'Hyrox Melbourne', eventDate: '2026-05-24', avgRunPaceMinPerKm: 5.42 },
  { eventName: 'Hyrox Brisbane', eventDate: '2026-08-09', avgRunPaceMinPerKm: 5.3 },
];

const MOCK_BODY_WEIGHT_KG = [82.4, 82.1, 81.8, 81.9, 81.5, 81.2];
const BODY_WEIGHT_LABELS = ['W1', 'W3', 'W5', 'W7', 'W9', 'W11'];

// TODO: replace MOCK_WEEKLY_VOLUME_KM with a Supabase query, e.g.:
//   supabase.from('running_logs').select('logged_date, distance_km')
//     .gte('logged_date', twelveWeeksAgoISO)
//   grouped and summed by ISO week.
// TODO: replace MOCK_HYROX_EVENTS with:
//   supabase.from('race_results').select('event_name, event_date, avg_run_pace')
//     .eq('type', 'hyrox').order('event_date')
// TODO: replace MOCK_BODY_WEIGHT_KG with body_weight_logs over the same range.

function formatPaceLabel(value) {
  const minutes = parseFloat(value);
  if (Number.isNaN(minutes)) return value;
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, '0')}`;
}

export default function RunningScreen() {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const textColor = isDark ? colors.text : colors.textOnSurface;
  const mutedColor = isDark ? colors.textMuted : colors.textOnSurfaceMuted;

  const volumeChartConfig = useMemo(
    () => getChartConfig({ cardBg, textColor, gridColor: mutedColor, accent: RUNNING_COLOR }),
    [cardBg, textColor, mutedColor],
  );

  const paceChartConfig = useMemo(
    () => ({
      ...getChartConfig({ cardBg, textColor, gridColor: mutedColor, accent: RUNNING_COLOR }),
      formatYLabel: formatPaceLabel,
    }),
    [cardBg, textColor, mutedColor],
  );

  const volumeData = useMemo(
    () => ({
      labels: WEEK_LABELS,
      datasets: [{ data: MOCK_WEEKLY_VOLUME_KM, color: () => RUNNING_COLOR }],
    }),
    [],
  );

  const paceData = useMemo(
    () => ({
      labels: MOCK_HYROX_EVENTS.map((event) =>
        new Date(`${event.eventDate}T00:00:00`).toLocaleDateString('en-AU', { month: 'short' }),
      ),
      datasets: [
        {
          data: MOCK_HYROX_EVENTS.map((event) => event.avgRunPaceMinPerKm),
          color: () => RUNNING_COLOR,
          strokeWidth: 2,
        },
      ],
    }),
    [],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Running</Text>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardLabel, { color: mutedColor }]}>Weekly Volume (km) — Last 12 Weeks</Text>
          <BarChart
            data={volumeData}
            width={CHART_WIDTH}
            height={200}
            chartConfig={volumeChartConfig}
            fromZero
            yAxisLabel=""
            yAxisSuffix="km"
            style={styles.chart}
          />
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardLabel, { color: mutedColor }]}>Avg Hyrox Run Pace (min/km)</Text>
          {MOCK_HYROX_EVENTS.length > 0 ? (
            <LineChart
              data={paceData}
              width={CHART_WIDTH}
              height={200}
              chartConfig={paceChartConfig}
              withDots
              bezier
              style={styles.chart}
            />
          ) : (
            <Text style={[styles.emptyText, { color: mutedColor }]}>
              Log an average run pace after your next Hyrox event to see it here.
            </Text>
          )}
        </View>

        <BodyCheckChart
          labels={BODY_WEIGHT_LABELS}
          data={MOCK_BODY_WEIGHT_KG}
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
        />
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
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
