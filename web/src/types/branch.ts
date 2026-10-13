export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';

/** A shop sells; a warehouse is staffed but has no till. */
export type BranchKind = 'BRANCH' | 'WAREHOUSE';

/** Who pays for a branch's raw material — FOCO: the business; FM: the branch itself. */
export type BranchOperatingModel = 'FOCO' | 'FM';

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  code: string;
  kind: BranchKind;
  operatingModel: BranchOperatingModel;
  city: string | null;
  region: string | null;
  country: string | null;
  addressLine: string | null;
  postalCode: string | null;
  timezone: string;
  currency: string | null;
  status: BranchStatus;
  openedAt: string | null;
  createdAt: string;
  updatedAt: string;
  latitude: string | null;
  longitude: string | null;
  /** null means this branch enforces no punch-in radius. */
  geofenceRadiusMeters: number | null;
  weeklyOffOverride: boolean;
  weeklyOffDays: number[];
}
