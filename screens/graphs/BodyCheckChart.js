import { StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { spacing } from '../../constants/theme';
import { CHART_WIDTH, getChartConfig } from './chartTheme';

const BODY_CHECK_COLOR = '#8B5CF6';

/**
 * Bodyweight-over-time overlay shown underneath the Strength and Running
 * charts. react-native-chart-kit has no dual-axis support, so this renders
 * as its own small chart rather than a second Y-axis on the chart above.
 */
export default function BodyCheckChart({ labels, data, cardBg, textColor, mutedColor }) {
  const chartConfig = getChartConfig({ cardBg, textColor, gridColor: mutedColor, accent: BODY_CHECK_COLOR });

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Text style={[styles.title, { color: textColor }]}>Body Check</Text>
      <Text style={[styles.subtitle, { color: mutedColor }]}>Bodyweight (kg) over the same period</Text>
      <LineChart
        data={{ labels, datasets: [{ data, color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`, strokeWidth: 2 }] }}
        width={CHART_WIDTH}
        height={120}
        chartConfig={chartConfig}
        withDots
        withInnerLines={false}
        withOuterLines={false}
        withShadow={false}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: spacing.md,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  chart: {
    borderRadius: 12,
    marginLeft: -spacing.md,
  },
});

export { BODY_CHECK_COLOR };
