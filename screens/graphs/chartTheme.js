import { Dimensions } from 'react-native';

export const CHART_WIDTH = Dimensions.get('window').width - 64;

export function hexToRgba(hex, opacity = 1) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Shared react-native-chart-kit config, themed to sit on a given card background. */
export function getChartConfig({ cardBg, textColor, gridColor, accent = '#FF4D1A' }) {
  return {
    backgroundColor: cardBg,
    backgroundGradientFrom: cardBg,
    backgroundGradientTo: cardBg,
    decimalPlaces: 0,
    color: (opacity = 1) => hexToRgba(accent, opacity),
    labelColor: (opacity = 1) => hexToRgba(textColor, opacity),
    propsForBackgroundLines: {
      stroke: hexToRgba(gridColor ?? textColor, 0.12),
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: accent,
    },
  };
}
