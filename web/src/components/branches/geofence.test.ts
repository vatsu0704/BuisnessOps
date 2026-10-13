import { describe, expect, it } from 'vitest';
import { checkGeofence, draftPoint, geofenceFromBranch } from './geofence';

describe('checkGeofence', () => {
  it('accepts a branch with no geofence at all', () => {
    expect(checkGeofence({ latitude: '', longitude: '', radius: '' })).toMatchObject({ radius: null, ok: true });
  });

  it('refuses a radius with nothing to measure from, as the server does', () => {
    const check = checkGeofence({ latitude: '23.03', longitude: '', radius: '150' });
    expect(check.radiusNeedsCoordinates).toBe(true);
    expect(check.ok).toBe(false);
  });

  it('refuses a radius that is zero, negative or not a number', () => {
    for (const radius of ['0', '-5', 'abc']) {
      expect(checkGeofence({ latitude: '23.03', longitude: '72.51', radius }).radiusIsValid).toBe(false);
    }
  });

  it('accepts coordinates and a positive radius', () => {
    expect(checkGeofence({ latitude: '23.03', longitude: '72.51', radius: ' 150 ' })).toMatchObject({
      radius: 150,
      hasCoordinates: true,
      ok: true,
    });
  });
});

describe('draftPoint', () => {
  it('is a point only when both halves are real coordinates', () => {
    expect(draftPoint({ latitude: '23.03', longitude: '72.51', radius: '' })).toEqual({ latitude: 23.03, longitude: 72.51 });
    expect(draftPoint({ latitude: '23.03', longitude: '', radius: '' })).toBeNull();
    expect(draftPoint({ latitude: '230', longitude: '72.51', radius: '' })).toBeNull();
    expect(draftPoint({ latitude: 'north', longitude: '72.51', radius: '' })).toBeNull();
  });
});

describe('geofenceFromBranch', () => {
  it('shows an unset radius as an empty field, not "null"', () => {
    expect(geofenceFromBranch({ latitude: null, longitude: null, geofenceRadiusMeters: null })).toEqual({
      latitude: '',
      longitude: '',
      radius: '',
    });
  });
});
