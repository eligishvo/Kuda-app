// City names under the airport dots. Like the price pins, each name follows its airport by running the
// map's projection on the UI thread; which names exist is decided in labels.ts.
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FONTS, Theme } from '../theme/themes';
import { LABEL_DROP, LABEL_W, MapLabel } from './labels';
import { makeView, project } from './projection';
import { MapView } from './useMapView';

type Props = { theme: Theme; labels: MapLabel[]; view: MapView; width: number; height: number };

export function CityLabels({ theme, labels, view, width, height }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {labels.map((l) => (
        <CityLabel key={l.code} theme={theme} label={l} view={view} width={width} height={height} />
      ))}
    </View>
  );
}

function CityLabel({ theme: t, label, view, width, height }: { theme: Theme; label: MapLabel; view: MapView; width: number; height: number }) {
  const { lon, lat } = label;
  const style = useAnimatedStyle(() => {
    const p = project(makeView(view.lon.value, view.lat.value, view.zoom.value, width, height), lon, lat);
    if (!p) return { opacity: 0, transform: [{ translateX: -1000 }, { translateY: -1000 }] };
    return { opacity: 1, transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y + LABEL_DROP }] };
  });
  return (
    <Animated.Text
      numberOfLines={1}
      style={[styles.label, { color: t.text, textShadowColor: t.background }, style]}
    >
      {label.text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute', left: 0, top: 0, width: LABEL_W, textAlign: 'center',
    fontFamily: FONTS.bodyMedium, fontSize: 10.5, lineHeight: 14,
    // A dark halo keeps the name readable over land and borders
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3,
  },
});
