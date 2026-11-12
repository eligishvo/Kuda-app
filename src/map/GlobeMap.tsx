// The map: a globe you can spin that flattens into a regional map as you pinch in.
// All drawing happens in one "frame" calculation on the UI thread (see draw.ts), so dragging and pinching
// don't wait for React. Taps are passed back to the screen, which decides what they select.
import { BlurMask, Canvas, Circle, DashPathEffect, Fill, Path, RadialGradient, Skia } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { cancelAnimation, runOnJS, useDerivedValue, useSharedValue, withDecay } from 'react-native-reanimated';
import { DEPARTURE, START_VIEW } from '../config';
import { Theme } from '../theme/themes';
import { drawAirports, drawCountries, drawGraticule } from './draw';
import { Hit, hitTest } from './hitTest';
import { AIRPORT_GEO, AIRPORTS, COUNTRIES_HIGH, COUNTRIES_LOW, GEO_HIGH, GEO_LOW, GRATICULE } from './mapData';
import {
  BASE_RADIUS, centerToPin, clampZoom, DEG, dragCenter, invert, makeView, MAX_LAT, MORPH_END, project,
} from './projection';

/** From this zoom on, the detailed (50m) borders are drawn instead of the coarse (110m) ones. */
export const DETAIL_ZOOM = 2.6;

type Props = {
  theme: Theme;
  /** Per country of the coarse / detailed border files: 0 plain, 1 selected, 2 partly selected, 3 home. */
  flagsLow: number[];
  flagsHigh: number[];
  /** Per airport: 1 when selected. */
  airportFlags: number[];
  /** Called with what was tapped (null for sea or space) and whether the map was flat at the time. */
  onHit: (hit: Hit, flat: boolean) => void;
};

export function GlobeMap({ theme, flagsLow, flagsHigh, airportFlags, onHit }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const w = size.w;
  const h = size.h;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }, []);

  // Where the map is looking: the place in the middle of the screen, and the zoom
  const lon = useSharedValue(START_VIEW.lon);
  const lat = useSharedValue(START_VIEW.lat);
  const zoom = useSharedValue(START_VIEW.zoom);

  // Selection, mirrored to the UI thread
  const low = useSharedValue(flagsLow);
  const high = useSharedValue(flagsHigh);
  const chosenAirports = useSharedValue(airportFlags);
  useEffect(() => { low.value = flagsLow; }, [flagsLow, low]);
  useEffect(() => { high.value = flagsHigh; }, [flagsHigh, high]);
  useEffect(() => { chosenAirports.value = airportFlags; }, [airportFlags, chosenAirports]);

  // One calculation per frame builds every shape on the map
  const frame = useDerivedValue(() => {
    const v = makeView(lon.value, lat.value, zoom.value, Math.max(w, 1), Math.max(h, 1));
    const land = Skia.PathBuilder.Make();
    const selected = Skia.PathBuilder.Make();
    const partial = Skia.PathBuilder.Make();
    const home = Skia.PathBuilder.Make();
    const graticule = Skia.PathBuilder.Make();
    const dots = Skia.PathBuilder.Make();
    const chosen = Skia.PathBuilder.Make();
    const detailed = zoom.value >= DETAIL_ZOOM;
    drawCountries(detailed ? GEO_HIGH : GEO_LOW, v, detailed ? high.value : low.value, [land, selected, partial, home]);
    drawGraticule(GRATICULE, v, graticule);
    drawAirports(AIRPORT_GEO, v, chosenAirports.value, dots, chosen);
    const dep = project(v, DEPARTURE.lon, DEPARTURE.lat);
    return {
      land: land.build(),
      selected: selected.build(),
      partial: partial.build(),
      home: home.build(),
      graticule: graticule.build(),
      dots: dots.build(),
      chosen: chosen.build(),
      rim: v.R * (1 + v.t),
      R: v.R,
      t: v.t,
      depX: dep ? dep.x : -100,
      depY: dep ? dep.y : -100,
    };
  });
  const land = useDerivedValue(() => frame.value.land);
  const selected = useDerivedValue(() => frame.value.selected);
  const partial = useDerivedValue(() => frame.value.partial);
  const home = useDerivedValue(() => frame.value.home);
  const graticule = useDerivedValue(() => frame.value.graticule);
  const dots = useDerivedValue(() => frame.value.dots);
  const chosen = useDerivedValue(() => frame.value.chosen);
  const rim = useDerivedValue(() => frame.value.rim);
  const flatness = useDerivedValue(() => frame.value.t);
  const glow = useDerivedValue(() => theme.rimGlowOpacity * (1 - frame.value.t));
  const depX = useDerivedValue(() => frame.value.depX);
  const depY = useDerivedValue(() => frame.value.depY);
  // The globe is lit from the top left
  const lightAt = useDerivedValue(() => Skia.Point(w / 2 - frame.value.R * 0.35, h / 2 - frame.value.R * 0.35));
  const lightReach = useDerivedValue(() => frame.value.R * 1.5);

  // Gestures. Pinch remembers the place under the fingers and keeps it there while zooming.
  const startZoom = useSharedValue(1);
  const pinLon = useSharedValue(0);
  const pinLat = useSharedValue(0);
  const pinned = useSharedValue(false);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      cancelAnimation(lon);
      cancelAnimation(lat);
    })
    .onChange((e) => {
      const R = Math.min(w, h) * BASE_RADIUS * zoom.value;
      const c = dragCenter(lon.value, lat.value, R, e.changeX, e.changeY);
      lon.value = c.lon;
      lat.value = c.lat;
    })
    .onEnd((e) => {
      // Let go while moving: the map keeps gliding and slows down
      const R = Math.min(w, h) * BASE_RADIUS * zoom.value;
      const cosLat = Math.max(0.2, Math.cos(lat.value * DEG));
      lon.value = withDecay({ velocity: -e.velocityX / (R * cosLat) / DEG, deceleration: 0.996 });
      lat.value = withDecay({ velocity: e.velocityY / R / DEG, deceleration: 0.996, clamp: [-MAX_LAT, MAX_LAT] });
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      cancelAnimation(lon);
      cancelAnimation(lat);
      startZoom.value = zoom.value;
      const place = invert(makeView(lon.value, lat.value, zoom.value, w, h), e.focalX, e.focalY);
      pinned.value = place != null;
      if (place) {
        pinLon.value = place.lon;
        pinLat.value = place.lat;
      }
    })
    .onUpdate((e) => {
      if (e.numberOfPointers < 2) return;
      const z = clampZoom(startZoom.value * e.scale);
      zoom.value = z;
      if (pinned.value) {
        const c = centerToPin(lon.value, lat.value, z, w, h, pinLon.value, pinLat.value, e.focalX, e.focalY);
        lon.value = c.lon;
        lat.value = c.lat;
      }
    });

  const handleTap = useCallback(
    (x: number, y: number, lon0: number, lat0: number, z: number) => {
      const v = makeView(lon0, lat0, z, w, h);
      const detailed = z >= DETAIL_ZOOM;
      onHit(
        hitTest(v, x, y, AIRPORTS, detailed ? COUNTRIES_HIGH : COUNTRIES_LOW, detailed ? GEO_HIGH.caps : GEO_LOW.caps),
        z >= MORPH_END,
      );
    },
    [w, h, onHit],
  );

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e, success) => {
      if (success) runOnJS(handleTap)(e.x, e.y, lon.value, lat.value, zoom.value);
    });

  const gesture = Gesture.Simultaneous(pan, pinch, tap);
  const cx = w / 2;
  const cy = h / 2;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} onLayout={onLayout}>
        {w > 0 && h > 0 && (
          <Canvas style={styles.fill}>
            <Fill color={theme.background} />
            {/* Sea: shaded like a ball when round, one flat colour when flat */}
            <Circle cx={cx} cy={cy} r={rim}>
              <RadialGradient c={lightAt} r={lightReach} colors={[theme.seaLight, theme.seaDark]} />
            </Circle>
            <Circle cx={cx} cy={cy} r={rim} color={theme.seaFlat} opacity={flatness} />
            <Circle cx={cx} cy={cy} r={rim} style="stroke" strokeWidth={14} color={theme.rimGlow} opacity={glow}>
              <BlurMask blur={14} style="normal" />
            </Circle>
            <Path path={graticule} style="stroke" strokeWidth={1} color={theme.graticule} />
            <Path path={land} color={theme.land} />
            <Path path={land} style="stroke" strokeWidth={0.8} color={theme.landBorder} />
            <Path path={home} color={theme.homeCountry} />
            <Path path={home} style="stroke" strokeWidth={0.8} color={theme.landBorder} />
            <Path path={partial} color={theme.land} />
            <Path path={partial} style="stroke" strokeWidth={1.6} color={theme.partial}>
              <DashPathEffect intervals={[6, 4]} />
            </Path>
            <Path path={selected} color={theme.selectedFill} />
            <Path path={selected} style="stroke" strokeWidth={1} color={theme.selectedStroke} />
            <Circle cx={cx} cy={cy} r={rim} style="stroke" strokeWidth={1} color={theme.rim} />
            <Path path={dots} color={theme.airportOther} />
            <Path path={chosen} color={theme.airportSelected} />
            {/* Departure airport */}
            <Circle cx={depX} cy={depY} r={3} color={theme.departureRing} />
            <Circle cx={depX} cy={depY} r={7} style="stroke" strokeWidth={1.5} color={theme.departureRing} />
          </Canvas>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
