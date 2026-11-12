// Small wrapper around the phone's key-value storage: values are saved as JSON and reads never throw.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = { theme: 'kuda.theme', selection: 'kuda.selection', connection: 'kuda.connection', search: 'kuda.search', trip: 'kuda.trip', trips: 'kuda.trips' };

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function save(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working, the value just isn't remembered
  }
}
