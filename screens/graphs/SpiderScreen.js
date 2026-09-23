/*
Supabase table needed (see constants/pillars.js for the ALTER TABLE statements
that add pillar_id / secondary_pillar_id to an existing workout_logs table):

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  logged_date date not null,
  workout_type text,
  pillar_id text,
  secondary_pillar_id text,
  created_at timestamptz default now()
);
*/

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { radii, spacing } from '../../constants/theme';
import { PILLARS } from '../../constants/pillars';
import { useTheme } from '../../context/ThemeContext';
import { hexToRgba } from './chartTheme';

const ACCENT = '#FF4D1A';
const AXIS_COUNT = PILLARS.length;
const ANGLE_STEP = (Math.PI * 2) / AXIS_COUNT;

const TIME_RANGES = [
  { label: '2 Weeks', days: 14 },
  { label: '4 Weeks', days: 28 },
  { label: '8 Weeks', days: 56 },
];

// Mock session log: { daysAgo, pillarId }. Dates are resolved relative to
// "today" at render time so the 2/4/8-week toggle has something real to
// filter. Roughly 3-4 sessions/week across the last 8 weeks.
//
// TODO: replace with a real Supabase query once workout_logs.pillar_id is
// populated, e.g.:
//   supabase.from('workout_logs')
//     .select('logged_date, pillar_id')
//     .gte('logged_date', rangeStartISO)
// then bucket by pillar_id the same way computeScores() does below.
const MOCK_SESSION_LOG = [
  { daysAgo: 1, pillarId: 'threshold' },
  { daysAgo: 2, pillarId: 'balanced_athleticism' },
  { daysAgo: 3, pillarId: 'aerobic_engine' },
  { daysAgo: 4, pillarId: 'fatigue_management' },
  { daysAgo: 6, pillarId: 'economy' },
  { daysAgo: 8, pillarId: 'threshold' },
  { daysAgo: 9, pillarId: 'balanced_athleticism' },
  { daysAgo: 10, pillarId: 'aerobic_engine' },
  { daysAgo: 11, pillarId: 'connection_courage' },
  { daysAgo: 13, pillarId: 'fatigue_management' },
  { daysAgo: 15, pillarId: 'economy' },
  { daysAgo: 16, pillarId: 'threshold' },
  { daysAgo: 17, pillarId: 'balanced_athleticism' },
  { daysAgo: 18, pillarId: 'durability' },
  { daysAgo: 20, pillarId: 'aerobic_engine' },
  { daysAgo: 22, pillarId: 'fatigue_management' },
  { daysAgo: 23, pillarId: 'economy' },
  { daysAgo: 24, pillarId: 'threshold' },
  { daysAgo: 25, pillarId: 'balanced_athleticism' },
  { daysAgo: 27, pillarId: 'connection_courage' },
  { daysAgo: 29, pillarId: 'aerobic_engine' },
  { daysAgo: 31, pillarId: 'durability' },
  { daysAgo: 33, pillarId: 'economy' },
  { daysAgo: 34, pillarId: 'threshold' },
  { daysAgo: 36, pillarId: 'balanced_athleticism' },
  { daysAgo: 38, pillarId: 'fatigue_management' },
  { daysAgo: 40, pillarId: 'aerobic_engine' },
  { daysAgo: 42, pillarId: 'training_principles' },
  { daysAgo: 44, pillarId: 'durability' },
  { daysAgo: 46, pillarId: 'economy' },
  { daysAgo: 48, pillarId: 'threshold' },
  { daysAgo: 50, pillarId: 'balanced_athleticism' },
  { daysAgo: 52, pillarId: 'connection_courage' },
  { daysAgo: 54, pillarId: 'aerobic_engine' },
];

function computeScores(sessions) {
  const total = sessions.length;
  const counts = Object.fromEntries(PILLARS.map((p) => [p.id, 0]));
  sessions.forEach((s) => {
    if (counts[s.pillarId] != null) counts[s.pillarId] += 1;
  });
  return Object.fromEntries(
    PILLARS.map((p) => [p.id, total > 0 ? Math.min(100, Math.round((counts[p.id] / total) * 100)) : 0])
  );
}

/** Point on the web at the given axis index and 0-1 value ratio from center. */
function axisPoint(index, ratio, center, radius) {
  const angle = -Math.PI / 2 + index * ANGLE_STEP;
  return {
    x: center + radius * ratio * Math.cos(angle),
    y: center + radius * ratio * Math.sin(angle),
  };
}

function polygonPoints(values, center, radius) {
  return PILLARS.map((p, i) => {
    const { x, y } = axisPoint(i, values[p.id] / 100, center, radius);
    return `${x},${y}`;
  }).join(' ');
}

export default function SpiderScreen() {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const textColor = isDark ? colors.text : colors.textOnSurface;
  const mutedColor = isDark ? colors.textMuted : colors.textOnSurfaceMuted;
  const gridColor = hexToRgba(mutedColor, 0.25);

  const [rangeIndex, setRangeIndex] = useState(1); // default: 4 weeks

  const scores = useMemo(() => {
    const cutoffDays = TIME_RANGES[rangeIndex].days;
    const sessions = MOCK_SESSION_LOG.filter((s) => s.daysAgo <= cutoffDays);
    return computeScores(sessions);
  }, [rangeIndex]);

  const size = 280;
  const center = size / 2;
  const radius = size / 2 - 44; // leave room for axis labels
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>8-Pillar Balance</Text>

        <View style={styles.rangeRow}>
          {TIME_RANGES.map((range, index) => {
            const selected = index === rangeIndex;
            return (
              <Text
                key={range.label}
                onPress={() => setRangeIndex(index)}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: selected ? ACCENT : cardBg,
                    color: selected ? '#FFFFFF' : mutedColor,
                    borderColor: selected ? ACCENT : colors.border,
                  },
                ]}
              >
                {range.label}
              </Text>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Svg width={size} height={size}>
            {rings.map((ringRatio) => (
              <Polygon
                key={ringRatio}
                points={PILLARS.map((_, i) => {
                  const { x, y } = axisPoint(i, ringRatio, center, radius);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke={gridColor}
                strokeWidth={1}
              />
            ))}

            {PILLARS.map((pillar, i) => {
              const outer = axisPoint(i, 1, center, radius);
              return (
                <Line
                  key={pillar.id}
                  x1={center}
                  y1={center}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={gridColor}
                  strokeWidth={1}
                />
              );
            })}

            <Polygon
              points={polygonPoints(scores, center, radius)}
              fill={hexToRgba(ACCENT, 0.4)}
              stroke={ACCENT}
              strokeWidth={2}
            />

            {PILLARS.map((pillar, i) => {
              const { x, y } = axisPoint(i, scores[pillar.id] / 100, center, radius);
              return <Circle key={pillar.id} cx={x} cy={y} r={3} fill={ACCENT} />;
            })}

            {PILLARS.map((pillar, i) => {
              const labelPoint = axisPoint(i, 1.22, center, radius);
              const cos = Math.cos(-Math.PI / 2 + i * ANGLE_STEP);
              const sin = Math.sin(-Math.PI / 2 + i * ANGLE_STEP);
              const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
              const dy = sin > 0.3 ? 8 : sin < -0.3 ? -2 : 3;
              return (
                <SvgText
                  key={pillar.id}
                  x={labelPoint.x}
                  y={labelPoint.y + dy}
                  fontSize={9}
                  fontWeight="700"
                  fill={pillar.color}
                  textAnchor={anchor}
                >
                  {pillar.name}
                </SvgText>
              );
            })}
          </Svg>
        </View>

        <View style={[styles.card, styles.listCard, { backgroundColor: cardBg }]}>
          {PILLARS.map((pillar) => (
            <View key={pillar.id} style={styles.pillarRow}>
              <View style={styles.pillarRowHeader}>
                <View style={[styles.dot, { backgroundColor: pillar.color }]} />
                <Text style={[styles.pillarName, { color: textColor }]}>{pillar.name}</Text>
                <Text style={[styles.pillarScore, { color: mutedColor }]}>{scores[pillar.id]}</Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: hexToRgba(pillar.color, 0.15) }]}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${scores[pillar.id]}%`, backgroundColor: pillar.color },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rangeChip: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 20,
    padding: spacing.md,
    alignItems: 'center',
  },
  listCard: {
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  pillarRow: {
    gap: 4,
  },
  pillarRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillarName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  pillarScore: {
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
