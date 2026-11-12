// Where the map is looking (the place in the middle of the screen, and the zoom), as values that live on the
// UI thread. Created by the screen so the map, the price pins and "fly to" all share them.
import { SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { START_VIEW } from '../config';
import { clampLat, MORPH_END } from './projection';

export type MapView = { lon: SharedValue<number>; lat: SharedValue<number>; zoom: SharedValue<number> };

export function useMapView(): MapView {
  const lon = useSharedValue(START_VIEW.lon);
  const lat = useSharedValue(START_VIEW.lat);
  const zoom = useSharedValue(START_VIEW.zoom);
  return { lon, lat, zoom };
}

/** Glides the map to a place, zooming in far enough for the map to be flat. */
export function flyTo(view: MapView, lon: number, lat: number) {
  // Take the short way round the globe
  let target = lon;
  while (target - view.lon.value > 180) target -= 360;
  while (target - view.lon.value < -180) target += 360;
  view.lon.value = withTiming(target, { duration: 600 });
  view.lat.value = withTiming(clampLat(lat), { duration: 600 });
  if (view.zoom.value < MORPH_END + 0.5) view.zoom.value = withTiming(MORPH_END + 0.5, { duration: 600 });
}
