/**
 * Where this browser is, for punching in and for placing a branch.
 *
 * The browser's own geolocation, which asks the person the first time. It works
 * only on HTTPS or localhost, and on a laptop it is usually Wi-Fi based — good
 * to tens of metres, which is what a branch's geofence radius allows for. The
 * server decides whether the place is close enough; this only reports it.
 */
export interface Coords {
  latitude: number;
  longitude: number;
}

export type LocationFailure = 'unsupported' | 'denied' | 'unavailable';

export function getCurrentCoords(): Promise<{ coords: Coords } | { failure: LocationFailure }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ failure: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
      (error) => resolve({ failure: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

/**
 * The coordinates to send with a punch, or none. As in the app, a punch is
 * attempted without them when the browser cannot say — a branch with no
 * geofence accepts it, and one with a geofence answers with its own message.
 */
export async function coordsForPunch(): Promise<{ latitude?: number; longitude?: number }> {
  const result = await getCurrentCoords();
  return 'coords' in result ? result.coords : {};
}

/** A link that opens these coordinates in the map app or Google Maps. */
export function mapLink({ latitude, longitude }: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
