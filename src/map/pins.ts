// What a price pin is and when its label shows. Kept apart from the drawing (PricePins.tsx) so the rules can
// be tested and shared with tap handling.
import { MORPH_END, MORPH_START } from './projection';

export type Pin = {
  code: string;
  lon: number;
  lat: number;
  /** What the label says, e.g. "$142", "~$110", "?". */
  label: string;
  kind: 'live' | 'estimate' | 'rough' | 'none';
  /** 0 = cheapest. Decides which labels show when the map is zoomed out and crowded. */
  rank: number;
  focused?: boolean;
};

export const PIN_W = 64;
export const PIN_H = 26;
/** Gap between the bottom of the label and the airport's position. */
export const PIN_LIFT = 9;

/** How many labels show at a zoom: a few on the globe, more while it flattens, all on the flat map. */
export function labelLimit(zoom: number): number {
  'worklet';
  if (zoom < MORPH_START) return 10;
  if (zoom < MORPH_END) return 25;
  return 9999;
}

/** Is this pin's label showing at this zoom? ("No estimate" pins only show on the flat map.) */
export function pinShows(kind: Pin['kind'], rank: number, zoom: number): boolean {
  'worklet';
  if (kind === 'none') return zoom >= MORPH_END;
  return rank < labelLimit(zoom);
}
