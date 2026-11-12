// Price labels on top of the map. Each pin follows its airport as the map moves, by running the same
// projection as the map drawing on the UI thread. Pins don't take touches themselves: a tap is handled by
// the map, which checks whether it landed on a pin (see hitPin in hitTest.ts).
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FONTS, Theme } from '../theme/themes';
import { Pin, PIN_H, PIN_LIFT, PIN_W, pinShows } from './pins';
import { makeView, project } from './projection';
import { MapView } from './useMapView';

type Props = { theme: Theme; pins: Pin[]; view: MapView; width: number; height: number };

export function PricePins({ theme, pins, view, width, height }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pins.map((p) => (
        <PinLabel key={p.code} theme={theme} pin={p} view={view} width={width} height={height} />
      ))}
    </View>
  );
}

function PinLabel({ theme: t, pin, view, width, height }: { theme: Theme; pin: Pin; view: MapView; width: number; height: number }) {
  const { lon, lat, kind, rank } = pin;
  const style = useAnimatedStyle(() => {
    const v = makeView(view.lon.value, view.lat.value, view.zoom.value, width, height);
    const p = project(v, lon, lat);
    if (!p || !pinShows(kind, rank, view.zoom.value)) return { opacity: 0, transform: [{ translateX: -1000 }, { translateY: -1000 }] };
    return { opacity: 1, transform: [{ translateX: p.x - PIN_W / 2 }, { translateY: p.y - PIN_H - PIN_LIFT }] };
  });

  // Google's prices are solid; older estimates are outlined and dimmer; unknown is a plain "?"
  const live = kind === 'live';
  const box = {
    backgroundColor: pin.focused ? t.accent : live ? t.panel : t.chip,
    borderColor: pin.focused ? t.accent : live ? t.price : t.border,
    borderStyle: kind === 'estimate' || kind === 'rough' ? ('dashed' as const) : ('solid' as const),
    opacity: kind === 'rough' || kind === 'none' ? 0.8 : 1,
  };
  const color = pin.focused ? t.buttonText : kind === 'none' ? t.muted : live ? t.price : t.text;
  return (
    <Animated.View style={[styles.pin, style]}>
      <View style={[styles.box, box]}>
        <Text style={[styles.label, { color }]} numberOfLines={1}>{pin.label}</Text>
      </View>
      <View style={[styles.stem, { backgroundColor: pin.focused ? t.accent : live ? t.price : t.border }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', left: 0, top: 0, width: PIN_W, height: PIN_H + PIN_LIFT, alignItems: 'center' },
  box: { height: PIN_H, minWidth: 34, maxWidth: PIN_W, paddingHorizontal: 7, borderRadius: PIN_H / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FONTS.bodyBold, fontSize: 12 },
  stem: { width: 2, height: PIN_LIFT - 2, borderRadius: 1 },
});
