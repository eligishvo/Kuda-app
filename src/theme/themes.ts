// The three colour themes. Every screen and the map read their colours from here,
// so a new theme is one more object in THEMES. Values come from docs/BRIEF.md.

export type ThemeId = 'monochrome' | 'ocean' | 'dusk';

export type Theme = {
  id: ThemeId;
  name: string;
  background: string;
  /** Sheets and cards. */
  panel: string;
  chip: string;
  border: string;
  text: string;
  muted: string;
  /** Globe shading runs from seaLight (lit side) to seaDark; the flat map uses seaFlat. */
  seaLight: string;
  seaDark: string;
  seaFlat: string;
  land: string;
  landBorder: string;
  graticule: string;
  rim: string;
  rimGlow: string;
  rimGlowOpacity: number;
  selectedFill: string;
  selectedStroke: string;
  /** Dashed outline of a country where only some airports are selected. */
  partial: string;
  /** Main button, routes, price pins. */
  accent: string;
  route: string;
  price: string;
  buttonText: string;
  airportSelected: string;
  airportOther: string;
  departureRing: string;
  homeCountry: string;
};

export const THEMES: Record<ThemeId, Theme> = {
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    background: '#050505',
    panel: '#111111',
    chip: '#1B1B1B',
    border: '#2E2E2E',
    text: '#F2F2F2',
    muted: '#A3A3A3',
    seaLight: '#161616',
    seaDark: '#060606',
    seaFlat: '#050505',
    land: '#3A3A3A',
    landBorder: '#141414',
    graticule: '#1C1C1C',
    rim: '#3A3A3A',
    rimGlow: '#FFFFFF',
    rimGlowOpacity: 0.1,
    selectedFill: '#F5F5F5',
    selectedStroke: '#FFFFFF',
    partial: '#F5F5F5',
    accent: '#FFFFFF',
    route: '#FFFFFF',
    price: '#FFFFFF',
    buttonText: '#0A0A0A',
    airportSelected: '#FFFFFF',
    airportOther: '#8A8A8A',
    departureRing: '#FFFFFF',
    homeCountry: '#8A8A8A',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    background: '#071526',
    panel: '#0C2036',
    chip: '#12304D',
    border: '#1E4468',
    text: '#EEF4FA',
    muted: '#9FB3C8',
    seaLight: '#14406B',
    seaDark: '#071E36',
    seaFlat: '#0A2441',
    land: '#2E6E72',
    landBorder: '#0D3A4A',
    graticule: '#0F2C4B',
    rim: '#2B5C8A',
    rimGlow: '#4FA3FF',
    rimGlowOpacity: 0.16,
    selectedFill: '#FF7A59',
    selectedStroke: '#FFC2B0',
    partial: '#FF7A59',
    accent: '#FF7A59',
    route: '#FFB199',
    price: '#FF9A7F',
    buttonText: '#1A0A05',
    airportSelected: '#FFD2C4',
    airportOther: '#8FB8C9',
    departureRing: '#FFFFFF',
    homeCountry: '#8FB8C9',
  },
  dusk: {
    id: 'dusk',
    name: 'Dusk',
    background: '#1A0F24',
    panel: '#24152F',
    chip: '#2E1C3B',
    border: '#45305A',
    text: '#FBEFF5',
    muted: '#C3A9C0',
    seaLight: '#3B2257',
    seaDark: '#160C22',
    seaFlat: '#231433',
    land: '#5E4270',
    landBorder: '#2A1838',
    graticule: '#2A1A3A',
    rim: '#6B4A7A',
    rimGlow: '#FF5E8A',
    rimGlowOpacity: 0.14,
    selectedFill: '#FF5E8A',
    selectedStroke: '#FFC1D3',
    partial: '#FFB347',
    accent: '#FFB347',
    route: '#FFB347',
    price: '#FFB347',
    buttonText: '#2A1300',
    airportSelected: '#FFD166',
    airportOther: '#B497BD',
    departureRing: '#FFFFFF',
    homeCountry: '#B497BD',
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = 'monochrome';

export const FONTS = {
  heading: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};

/** Smallest size of anything you tap. */
export const TOUCH = 44;
