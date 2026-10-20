import brandMark from '@/constants/brandMark.json';

/**
 * The palette. `web/src/styles/tokens.css` mirrors it name for name — change
 * both in the same commit.
 *
 * ## Navy leads, coral accents, and that is a measurement not a preference
 *
 * Both come from the logo (`constants/brandMark.json`), so the UI and the mark
 * beside it cannot drift. Which one drives the controls was decided by contrast:
 * navy is 14.0:1 on white, while **coral is 3.37:1** — it fails WCAG AA for body
 * text, and white on a coral fill fails too, so a coral button with a normal-size
 * label is unreadable to the standard. Coral on the light pink is 2.66:1, worse
 * than either on its own.
 *
 * So coral is for the mark, the "pay" of the wordmark and large figures, and
 * `accentStrong` (5.7:1) is what carries coral-coloured *text* and the label on
 * a coral fill. Reach for `accent` when something should look like the brand and
 * `accentStrong` when it has to be read.
 *
 * `error` is deliberately deeper than the stock red: coral sits close enough to
 * `#DC2626` that a loss figure, a validation message and ordinary brand chrome
 * would have read alike.
 */
export const colors = {
  primary: brandMark.navy,
  primaryDark: '#021C40',
  primaryLight: '#E7EDF6',
  /** The logo's coral. Marks, fills and large text — never body text. */
  accent: brandMark.coral,
  /** Coral dark enough to read at any size, and to take a white label. */
  accentStrong: '#C81E1F',
  /** The logo's light pink. */
  accentLight: '#FDDDDE',
  background: '#FAFAFB',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  /** A hairline between rows — lighter than `border`, which outlines a shape. */
  divider: '#F4F4F5',
  text: '#18181B',
  textSecondary: '#71717A',
  textTertiary: '#A1A1AA',
  error: '#B42318',
  errorBg: '#FEF2F2',
  success: '#16A34A',
  successBg: '#E8F6ED',
  warning: '#D97706',
  warningBg: '#FDF3E3',
  mutedBg: '#F1F1F5',
  /** Warning wording on `warningBg`; `warning` itself is 3.2:1 and too light to read. */
  warningStrong: '#92400E',
  /** On the brand gradient. The muted pair had drifted to four different alphas. */
  textOnPrimary: '#FFFFFF',
  textOnPrimaryMuted: 'rgba(255, 255, 255, 0.86)',
  surfaceOnPrimary: 'rgba(255, 255, 255, 0.18)',
  /** Behind a sheet or a modal. */
  scrim: 'rgba(24, 24, 27, 0.45)',
  white: '#FFFFFF',
};

/**
 * The brand fill for buttons, hero cards and avatars.
 *
 * Navy, not coral: white text clears AA across the whole of it (10.7:1 at the
 * light end), which white on coral does not. `accent` is the coral pair, for
 * the mark and for hero art that carries no small text.
 */
export const gradient = {
  brand: ['#0B3C7E', colors.primary] as const,
  accent: ['#FD6B5B', colors.accent] as const,
  disabled: ['#C7C7CC', '#AEAEB2'] as const,
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
