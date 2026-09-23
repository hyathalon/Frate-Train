import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const TABS = ['Load', 'Progress', 'Race', 'Pace', 'Run'];

// ---------- shared helpers ----------

function parseTimeToSeconds(value) {
  const parts = value.split(':').map((part) => parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function secondsToClock(totalSeconds, showSign = false) {
  const sign = totalSeconds < 0 ? '-' : showSign ? '+' : '';
  const abs = Math.round(Math.abs(totalSeconds));
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ---------- shared mini components ----------

function BarRow({ label, value, max, displayValue }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.barValue}>{displayValue}</Text>
    </View>
  );
}

function TrendLineChart({ data, width = 300, height = 140 }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const values = data.map((point) => point.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const paddingX = 16;
  const paddingY = 16;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = data.map((point, index) => {
    const x = paddingX + (index / (data.length - 1)) * chartWidth;
    const y = paddingY + chartHeight - ((point.value - minValue) / range) * chartHeight;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View>
      <Svg width={width} height={height}>
        <Line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, index) => (
          <Circle key={index} cx={p.x} cy={p.y} r={3.5} fill={colors.primary} />
        ))}
      </Svg>
      <View style={styles.chartLabelsRow}>
        {data.map((point) => (
          <Text key={point.week} style={styles.chartLabel}>
            {point.week}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------- Load tab ----------

const muscleLoad = [
  { group: 'Legs', value: 82 },
  { group: 'Cardio', value: 90 },
  { group: 'Core', value: 74 },
  { group: 'Back', value: 65 },
  { group: 'Shoulders', value: 48 },
  { group: 'Chest', value: 40 },
];

function LoadTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const max = Math.max(...muscleLoad.map((item) => item.value));
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Muscle Group Load — This Week</Text>
      <Text style={styles.cardSubtitle}>Relative training load by muscle group (0-100)</Text>
      <View style={styles.barList}>
        {muscleLoad.map((item) => (
          <BarRow
            key={item.group}
            label={item.group}
            value={item.value}
            max={max}
            displayValue={item.value}
          />
        ))}
      </View>
    </View>
  );
}

// ---------- Progress tab ----------

const volumeTrend = [
  { week: 'W1', value: 28 },
  { week: 'W2', value: 31 },
  { week: 'W3', value: 35 },
  { week: 'W4', value: 30 },
  { week: 'W5', value: 38 },
  { week: 'W6', value: 42 },
  { week: 'W7', value: 39 },
  { week: 'W8', value: 45 },
];

function ProgressTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const first = volumeTrend[0].value;
  const last = volumeTrend[volumeTrend.length - 1].value;
  const change = Math.round(((last - first) / first) * 100);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Weekly Training Volume</Text>
      <Text style={styles.cardSubtitle}>Total hours per week, last 8 weeks</Text>
      <TrendLineChart data={volumeTrend} />
      <Text style={styles.insightText}>
        Volume is {change >= 0 ? 'up' : 'down'} {Math.abs(change)}% since week 1 (
        {first}h → {last}h).
      </Text>
    </View>
  );
}

// ---------- Race tab ----------

const raceSplits = [
  { name: 'Run 1', actual: '4:32', target: '4:15' },
  { name: 'SkiErg', actual: '3:58', target: '3:45' },
  { name: 'Run 2', actual: '4:41', target: '4:15' },
  { name: 'Sled Push', actual: '2:15', target: '2:00' },
  { name: 'Run 3', actual: '4:38', target: '4:15' },
  { name: 'Sled Pull', actual: '2:40', target: '2:10' },
  { name: 'Run 4', actual: '4:50', target: '4:15' },
  { name: 'Burpee Broad Jumps', actual: '3:20', target: '3:00' },
  { name: 'Run 5', actual: '4:45', target: '4:15' },
  { name: 'Rowing', actual: '4:10', target: '3:50' },
  { name: 'Run 6', actual: '4:55', target: '4:15' },
  { name: 'Farmers Carry', actual: '1:50', target: '1:40' },
  { name: 'Run 7', actual: '5:02', target: '4:15' },
  { name: 'Sandbag Lunges', actual: '3:45', target: '3:20' },
  { name: 'Run 8', actual: '5:10', target: '4:15' },
  { name: 'Wall Balls', actual: '4:20', target: '3:50' },
];

const STATION_TIPS = {
  'Sled Push': 'Drive through the legs and keep shoulders low — extra push-sled reps will help.',
  'Sled Pull': 'Focus on a strong hand-over-hand rhythm and bracing your core.',
  'Burpee Broad Jumps': 'Work on smoother sit-up-to-jump transitions to save time.',
  Rowing: 'Increase stroke rate slightly and drive with the legs first.',
  'Farmers Carry': 'Build grip endurance with heavier carries in training.',
  'Sandbag Lunges': 'Add weighted lunges to build late-race leg strength.',
  'Wall Balls': 'Work on squat depth and a consistent throw height to avoid no-reps.',
  SkiErg: 'Focus on a longer pull and engaging the lats more on each stroke.',
};

function getStationTip(name) {
  if (name.startsWith('Run')) {
    return 'Practice race-pace running off the back of station work to build running economy under fatigue.';
  }
  return STATION_TIPS[name] ?? 'Add extra volume on this station in training to close the gap.';
}

function RaceTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const analyzed = raceSplits.map((split) => {
    const actualSeconds = parseTimeToSeconds(split.actual);
    const targetSeconds = parseTimeToSeconds(split.target);
    return { ...split, deltaSeconds: actualSeconds - targetSeconds };
  });

  const weakest = [...analyzed].sort((a, b) => b.deltaSeconds - a.deltaSeconds).slice(0, 3);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Race Analysis</Text>
      <Text style={styles.cardSubtitle}>Most recent HYROX race vs. target splits</Text>

      <View style={styles.splitList}>
        {analyzed.map((split) => (
          <View key={split.name} style={styles.splitRow}>
            <Text style={styles.splitName}>{split.name}</Text>
            <Text style={styles.splitTimes}>
              {split.actual} vs {split.target}
            </Text>
            <Text
              style={[
                styles.splitDelta,
                split.deltaSeconds > 0 ? styles.splitDeltaSlow : styles.splitDeltaFast,
              ]}
            >
              {secondsToClock(split.deltaSeconds, true)}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.weaknessTitle}>Weakest Areas</Text>
      {weakest.map((split) => (
        <View key={split.name} style={styles.weaknessCard}>
          <Text style={styles.weaknessName}>
            {split.name} · {secondsToClock(split.deltaSeconds, true)} off target
          </Text>
          <Text style={styles.weaknessTip}>{getStationTip(split.name)}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- Pace tab ----------

const GOAL_TIME_OPTIONS = [
  { label: '60 min', seconds: 60 * 60 },
  { label: '75 min', seconds: 75 * 60 },
  { label: '90 min', seconds: 90 * 60 },
  { label: '105 min', seconds: 105 * 60 },
  { label: '120 min', seconds: 120 * 60 },
];

const RUN_SHARE = 0.45;
const STATION_SHARE = 0.55;

function PaceTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [goalSeconds, setGoalSeconds] = useState(GOAL_TIME_OPTIONS[1].seconds);
  const [customTime, setCustomTime] = useState('');

  const customSeconds = parseTimeToSeconds(customTime);
  const activeSeconds = customSeconds ?? goalSeconds;

  const runPaceSeconds = (activeSeconds * RUN_SHARE) / 8;
  const stationPaceSeconds = (activeSeconds * STATION_SHARE) / 8;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>HYROX Pace Calculator</Text>
      <Text style={styles.cardSubtitle}>Pick a goal finish time</Text>

      <View style={styles.chipRow}>
        {GOAL_TIME_OPTIONS.map((option) => {
          const active = !customSeconds && option.seconds === goalSeconds;
          return (
            <TouchableOpacity
              key={option.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                setGoalSeconds(option.seconds);
                setCustomTime('');
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Or enter a custom goal time (hh:mm:ss or mm:ss)</Text>
      <TextInput
        style={styles.input}
        value={customTime}
        onChangeText={setCustomTime}
        placeholder="e.g. 1:32:00"
        placeholderTextColor={colors.textOnSurfaceFaint}
        autoCapitalize="none"
      />

      <View style={styles.resultsRow}>
        <View style={styles.resultTile}>
          <Text style={styles.resultValue}>{secondsToClock(runPaceSeconds)}</Text>
          <Text style={styles.resultLabel}>Target run pace / km</Text>
        </View>
        <View style={styles.resultTile}>
          <Text style={styles.resultValue}>{secondsToClock(stationPaceSeconds)}</Text>
          <Text style={styles.resultLabel}>Target avg station time</Text>
        </View>
      </View>

      <Text style={styles.weaknessTitle}>Suggested Splits</Text>
      <View style={styles.splitList}>
        {raceSplits.map((split) => (
          <View key={split.name} style={styles.splitRow}>
            <Text style={styles.splitName}>{split.name}</Text>
            <Text style={styles.splitTimes}>
              {secondsToClock(split.name.startsWith('Run') ? runPaceSeconds : stationPaceSeconds)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- Run tab ----------

const runSplits = [
  { km: 1, time: '4:32' },
  { km: 2, time: '4:35' },
  { km: 3, time: '4:38' },
  { km: 4, time: '4:34' },
  { km: 5, time: '4:40' },
  { km: 6, time: '4:37' },
  { km: 7, time: '4:44' },
  { km: 8, time: '4:41' },
  { km: 9, time: '4:48' },
  { km: 10, time: '4:52' },
];

function RunTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const seconds = runSplits.map((split) => parseTimeToSeconds(split.time));
  const fastest = Math.min(...seconds);
  const slowest = Math.max(...seconds);
  const avg = seconds.reduce((sum, value) => sum + value, 0) / seconds.length;

  const half = Math.floor(seconds.length / 2);
  const firstHalfAvg = seconds.slice(0, half).reduce((sum, v) => sum + v, 0) / half;
  const secondHalfAvg = seconds.slice(half).reduce((sum, v) => sum + v, 0) / (seconds.length - half);
  const splitDelta = secondHalfAvg - firstHalfAvg;

  const insight =
    splitDelta > 3
      ? `You positive-split by ${secondsToClock(splitDelta)}/km — work on even pacing across the race.`
      : splitDelta < -3
        ? `Nice negative split — you paced up by ${secondsToClock(Math.abs(splitDelta))}/km in the back half.`
        : 'Pacing was even across the race — solid pacing discipline.';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Running Race Analysis</Text>
      <Text style={styles.cardSubtitle}>Most recent 10K — km splits</Text>

      <View style={styles.resultsRow}>
        <View style={styles.resultTile}>
          <Text style={styles.resultValue}>{secondsToClock(avg)}</Text>
          <Text style={styles.resultLabel}>Avg pace / km</Text>
        </View>
        <View style={styles.resultTile}>
          <Text style={styles.resultValue}>{secondsToClock(fastest)}</Text>
          <Text style={styles.resultLabel}>Fastest km</Text>
        </View>
        <View style={styles.resultTile}>
          <Text style={styles.resultValue}>{secondsToClock(slowest)}</Text>
          <Text style={styles.resultLabel}>Slowest km</Text>
        </View>
      </View>

      <View style={styles.barList}>
        {runSplits.map((split, index) => (
          <BarRow
            key={split.km}
            label={`Km ${split.km}`}
            value={slowest - seconds[index] + 10}
            max={slowest - fastest + 10}
            displayValue={split.time}
          />
        ))}
      </View>

      <Text style={styles.insightText}>{insight}</Text>
    </View>
  );
}

// ---------- screen ----------

export default function GraphsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState(TABS[0]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Graphs</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, active && styles.tabChipActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'Load' && <LoadTab />}
        {activeTab === 'Progress' && <ProgressTab />}
        {activeTab === 'Race' && <RaceTab />}
        {activeTab === 'Pace' && <PaceTab />}
        {activeTab === 'Run' && <RunTab />}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  tabRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  tabChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: colors.primary,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textOnSurface,
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
  },
  barList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barLabel: {
    width: 64,
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  barValue: {
    width: 44,
    textAlign: 'right',
    color: colors.textOnSurface,
    fontSize: 12,
    fontWeight: '700',
  },
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  chartLabel: {
    color: colors.textOnSurfaceFaint,
    fontSize: 10,
  },
  insightText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  splitList: {
    gap: 6,
    marginTop: spacing.xs,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  splitName: {
    flex: 1.4,
    color: colors.textOnSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  splitTimes: {
    flex: 1,
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
  },
  splitDelta: {
    width: 56,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  splitDeltaSlow: {
    color: colors.primary,
  },
  splitDeltaFast: {
    color: colors.success,
  },
  weaknessTitle: {
    color: colors.textOnSurface,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  weaknessCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 2,
    marginTop: spacing.xs,
  },
  weaknessName: {
    color: colors.textOnSurface,
    fontSize: 13,
    fontWeight: '700',
  },
  weaknessTip: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  chipText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
  },
  label: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textOnSurface,
  },
  resultsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  resultTile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  resultValue: {
    color: colors.textOnSurface,
    fontSize: 17,
    fontWeight: '700',
  },
  resultLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  });
}
