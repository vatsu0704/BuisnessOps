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
}
