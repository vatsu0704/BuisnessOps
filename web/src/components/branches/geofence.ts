/**
 * A branch's punch-in geofence as typed into a form — the app's rules, written
 * once for both branch forms rather than twice as the app has them.
 *
 * Every field is the text in its input. A radius left empty means "no geofence",
 * which is the default and a perfectly ordinary branch.
 */
export type GeofenceDraft = { latitude: string; longitude: string; radius: string };

export const EMPTY_GEOFENCE: GeofenceDraft = { latitude: '', longitude: '', radius: '' };

export function checkGeofence(draft: GeofenceDraft) {
  const radius = draft.radius.trim() === '' ? null : Number(draft.radius);
  const hasCoordinates = draft.latitude.trim() !== '' && draft.longitude.trim() !== '';
  // The server's own rule, said before the request rather than after it: a
  // radius with no point to measure from could never be checked.
  const radiusNeedsCoordinates = radius !== null && !hasCoordinates;
  const radiusIsValid = radius === null || (Number.isFinite(radius) && radius > 0);
  return {
    radius,
    hasCoordinates,
    radiusNeedsCoordinates,
    radiusIsValid,
    ok: radiusIsValid && !radiusNeedsCoordinates,
  };
}

/** The point the draft names, when both halves are real coordinates — for the map link. */
export function draftPoint(draft: GeofenceDraft): { latitude: number; longitude: number } | null {
  if (draft.latitude.trim() === '' || draft.longitude.trim() === '') return null;
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** A saved branch's geofence, as the form shows it. */
export function geofenceFromBranch(branch: {
  latitude: string | null;
  longitude: string | null;
  geofenceRadiusMeters: number | null;
}): GeofenceDraft {
  return {
    latitude: branch.latitude ?? '',
    longitude: branch.longitude ?? '',
    radius: branch.geofenceRadiusMeters === null ? '' : String(branch.geofenceRadiusMeters),
  };
}
