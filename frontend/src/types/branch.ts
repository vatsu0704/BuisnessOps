export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  code: string;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string;
  currency: string | null;
  status: BranchStatus;
  openedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // The API has always returned these; the type simply omitted them.
  latitude: string | null;
  longitude: string | null;
  /** Punch-in geofencing is opt-in: null means this branch enforces no radius. */
  geofenceRadiusMeters: number | null;
  /** When true, this branch's weeklyOffDays replace the business default whole. */
  weeklyOffOverride: boolean;
  weeklyOffDays: number[];
}
