import brandMark from '@/constants/brandMark.json';

export const colors = {
  // The logo's blue (constants/brandMark.json), so every button, chip and link
  // matches the mark beside it. The two shades below share its hue.
  primary: brandMark.blue,
  primaryDark: '#3A2FC4',
  primaryLight: '#EEEDFD',
  background: '#FAFAFB',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  text: '#18181B',
  textSecondary: '#71717A',
  textTertiary: '#A1A1AA',
  error: '#DC2626',
  errorBg: '#FEF2F2',
  success: '#16A34A',
  warning: '#D97706',
  white: '#FFFFFF',
};

/**
 * The brand fill for buttons, hero cards and avatars: the ribbon's lighter blue
 * easing into primaryDark. White text keeps AA contrast across the whole of it.
 */
export const gradient = {
  brand: ['#5B4FF0', colors.primaryDark] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const },
  subtitle: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
};
