// HARRY's palette: warm walnut mid-tones. Not bright white, not black.
// One fixed theme so the mood is the same day or night.
export const C = {
  bgTop: '#4A3B32',
  bgBottom: '#3B2F28',
  surface: '#574638',
  surfaceHigh: '#655243',
  line: 'rgba(245, 237, 227, 0.12)',
  text: '#F5EDE3',
  textDim: '#CDBFAF',
  textFaint: '#A08F7E',
  accent: '#E0A458', // amber
  accentDeep: '#C98B4F',
  onAccent: '#2B211B',
  sage: '#9DB5A0',
  danger: '#E07A5F',
  harryBubble: '#5E4C40',
  userBubble: '#E0A458',
} as const;

export const F = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const R = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
