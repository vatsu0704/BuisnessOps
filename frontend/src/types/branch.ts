export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';

/**
 * What a location IS, as opposed to where it is.
 *
 * A warehouse is a place the business occupies and staffs — people work there
 * and punch in there — but it does not sell and it does not order raw material
 * from itself. It is a Branch so that attendance, geofencing, payroll and
 * rosters work there on the day it is created; all four are already keyed on a
 * branch.
 */
export type BranchKind = 'BRANCH' | 'WAREHOUSE';

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  code: string;
  kind: BranchKind;
  city: string | null;
  region: string | null;
  country: string | null;
  /**
   * Where a delivery actually goes, as opposed to where the branch is for
   * reporting. Free text and multi-line — an address is not a fixed set of
   * fields, and the landmark is usually the half that finds the place.
   */
  addressLine: string | null;
  postalCode: string | null;
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
