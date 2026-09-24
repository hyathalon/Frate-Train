/*
Supabase table needed (see constants/pillars.js for the ALTER TABLE
statements that add pillar_id / secondary_pillar_id):

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

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { PILLARS, WORKOUT_PILLAR_MAP } from '../constants/pillars';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const ACCENT = '#FF4D1A';
const RANGE_DAYS = 28;

const SIZE = 320;
const CENTER = 160;
const MAX_RADIUS = 120;
const MIN_RADIUS = 20;
const AXIS_COUNT = PILLARS.length;
const ANGLE_STEP = (Math.PI * 2) / AXIS_COUNT;
const RING_RATIOS = [0.25, 0.5, 0.75, 1];

const SHORT_LABELS = {
  aerobic_engine: 'Aerobic',
  threshold: 'Threshold',
  durability: 'Durability',
  economy: 'Economy',
  balanced_athleticism: 'Athleticism',
  fatigue_management: 'Fatigue Mgmt',
  training_principles: 'Principles',
  connection_courage: 'Courage',
};

function hexToRgba(hex, opacity = 1) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function axisPointAtRadius(index, radiusPx) {
  const angle = -Math.PI / 2 + index * ANGLE_STEP;
  return {
    x: CENTER + radiusPx * Math.cos(angle),
    y: CENTER + radiusPx * Math.sin(angle),
  };
}

function computeCounts(sessions) {
  const counts = Object.fromEntries(PILLARS.map((p) => [p.id, 0]));
  sessions.forEach((session) => {
    const pillarId = WORKOUT_PILLAR_MAP[session.workout_type];
    if (pillarId && counts[pillarId] != null) counts[pillarId] += 1;
  });
  return counts;
}

export default function PillarSpiderScreen() {
  const { colors, isDark } = useTheme();
  const cardBg = isDark ? '#1C1C1E' : colors.surface;
  const gridColor = hexToRgba(isDark ? colors.textMuted : colors.textOnSurfaceMuted, 0.25);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [legendExpanded, setLegendExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - RANGE_DAYS);
        const cutoffISO = cutoff.toISOString().slice(0, 10);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        let query = supabase
          .from('workout_logs')
          .select('workout_type, logged_date')
          .gte('logged_date', cutoffISO);
        if (user) query = query.eq('user_id', user.id);

        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        if (!cancelled) setSessions(data ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load sessions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => computeCounts(sessions), [sessions]);
  const maxCount = useMemo(() => Math.max(0, ...Object.values(counts)), [counts]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Pillar Balance</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Last 28 days</Text>
        </View>

        {loading ? (
          <View style={[styles.card, { backgroundColor: cardBg, alignItems: 'center' }]}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: cardBg, alignItems: 'center' }]}>
            <Svg width={SIZE} height={SIZE}>
              {RING_RATIOS.map((ringRatio) => (
                <Polygon
                  key={ringRatio}
                  points={PILLARS.map((_, i) => {
                    const { x, y } = axisPointAtRadius(i, ringRatio * MAX_RADIUS);
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={gridColor}
                  strokeWidth={1}
                />
              ))}

              {PILLARS.map((pillar, i) => {
                const outer = axisPointAtRadius(i, MAX_RADIUS);
                return (
                  <Line
                    key={pillar.id}
                    x1={CENTER}
                    y1={CENTER}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}

              <Polygon
                points={PILLARS.map((pillar, i) => {
                  const ratio = maxCount > 0 ? counts[pillar.id] / maxCount : 0;
                  const radiusPx = Math.max(MIN_RADIUS, ratio * MAX_RADIUS);
                  const { x, y } = axisPointAtRadius(i, radiusPx);
                  return `${x},${y}`;
                }).join(' ')}
                fill={hexToRgba(ACCENT, 0.3)}
                stroke={ACCENT}
                strokeWidth={2}
              />

              {PILLARS.map((pillar, i) => {
                const ratio = maxCount > 0 ? counts[pillar.id] / maxCount : 0;
                const radiusPx = Math.max(MIN_RADIUS, ratio * MAX_RADIUS);
                const { x, y } = axisPointAtRadius(i, radiusPx);
                return <Circle key={pillar.id} cx={x} cy={y} r={4} fill={pillar.color} />;
              })}

              {PILLARS.map((pillar, i) => {
                const labelPoint = axisPointAtRadius(i, MAX_RADIUS + 20);
                const cos = Math.cos(-Math.PI / 2 + i * ANGLE_STEP);
                const sin = Math.sin(-Math.PI / 2 + i * ANGLE_STEP);
                const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
                const dy = sin > 0.3 ? 8 : sin < -0.3 ? -2 : 3;
                return (
                  <SvgText
                    key={pillar.id}
                    x={labelPoint.x}
                    y={labelPoint.y + dy}
                    fontSize={10}
                    fontWeight="700"
                    fill={pillar.color}
                    textAnchor={anchor}
                  >
                    {SHORT_LABELS[pillar.id]}
                  </SvgText>
                );
              })}
            </Svg>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {PILLARS.map((pillar) => {
            const count = counts[pillar.id] ?? 0;
            const zero = count === 0 && !loading && !error;
            return (
              <View
                key={pillar.id}
                style={[
                  styles.chip,
                  { backgroundColor: pillar.color },
                  zero && styles.chipZero,
                ]}
              >
                <Text style={styles.chipName}>{pillar.name}</Text>
                {zero ? (
                  <Text style={styles.chipWarning}>⚠ No sessions</Text>
                ) : (
                  <Text style={styles.chipCount}>{count}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={styles.legendHeader}
            onPress={() => setLegendExpanded((prev) => !prev)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="hexagon-multiple-outline"
              size={16}
              color={colors.textOnSurfaceMuted}
            />
            <Text style={[styles.legendHeaderText, { color: colors.textOnSurface }]}>
              What does this mean?
            </Text>
            <Ionicons
              name={legendExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textOnSurfaceMuted}
            />
          </TouchableOpacity>

          {legendExpanded && (
            <View style={styles.legendList}>
              {PILLARS.map((pillar) => (
                <View key={pillar.id} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: pillar.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.legendName, { color: colors.textOnSurface }]}>{pillar.name}</Text>
                    <Text style={[styles.legendTagline, { color: colors.textOnSurfaceMuted }]}>
                      {pillar.tagline}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
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
    marginTop: 2,
  },
  card: {
    borderRadius: 20,
    padding: spacing.md,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
  },
  chipRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 110,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipZero: {
    borderColor: '#EF4444',
  },
  chipName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  chipCount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  chipWarning: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  legendList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  legendName: {
    fontSize: 13,
    fontWeight: '700',
  },
  legendTagline: {
    fontSize: 12,
    marginTop: 1,
  },
});
