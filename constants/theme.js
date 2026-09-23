const shared = {
  primary: '#FF4D1A',
  primaryMuted: 'rgba(255, 77, 26, 0.12)',

  // Cards are always white with the same border/text tones in both themes —
  // only the app-level background and the text sitting directly on it change.
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  border: '#E4E4E7',
  textOnSurface: '#111111',
  textOnSurfaceMuted: '#52525B',
  textOnSurfaceFaint: '#A1A1AA',

  success: '#34C759',
  successMuted: 'rgba(52, 199, 89, 0.16)',
  warning: '#FFB020',
  warningMuted: 'rgba(255, 176, 32, 0.16)',
};

export const darkColors = {
  ...shared,
  background: '#111111',
  text: '#FFFFFF',
  textMuted: '#9CA3AF',
};

export const lightColors = {
  ...shared,
  background: '#F4F4F5',
  text: '#111111',
  textMuted: '#52525B',
};

export function getColors(mode) {
  return mode === 'light' ? lightColors : darkColors;
}

// Legacy static export — prefer `useTheme().colors` in components so the
// palette responds to the user's light/dark preference.
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};
