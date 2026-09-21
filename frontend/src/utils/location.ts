import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * The device's current position, or null when it cannot be had — permission
 * declined, location services off, or no fix.
 *
 * Callers decide what null means, which is why this returns it rather than
 * throwing. A punch treats it as "carry on without coordinates", because the
 * backend is the authority on whether the branch's geofence needed them.
 * Setting a branch's location treats it as a failure worth showing, because
 * the person explicitly asked for it and nothing else will happen.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * The punch-in shape: an object that spreads into a request body, empty when
 * there is no fix. Separate from getCurrentCoords so the two callers that
 * punch do not each have to remember that {} is the right way to say "none".
 */
export async function coordsForPunch(): Promise<{ latitude?: number; longitude?: number }> {
  return (await getCurrentCoords()) ?? {};
}
