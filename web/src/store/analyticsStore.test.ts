import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchMonthlyReport } from '@/types/analytics';

const getBranchMonthly = vi.fn<(businessId: string, range: { from?: string; to?: string }) => Promise<BranchMonthlyReport>>();
vi.mock('@/api/analytics', () => ({
  getBranchMonthly: (b: string, r: { from?: string; to?: string }) => getBranchMonthly(b, r),
  getCrossBusiness: vi.fn(),
}));

const { useAnalyticsStore, analyticsKey } = await import('./analyticsStore');

const report = (months: string[]) => ({ months, branches: [] }) as unknown as BranchMonthlyReport;
const SIX = { from: '2026-05', to: '2026-10' };
const TWELVE = { from: '2025-11', to: '2026-10' };

describe('analyticsStore', () => {
  beforeEach(() => {
    getBranchMonthly.mockReset();
    useAnalyticsStore.getState().reset();
  });

  it('treats another month range as other data, not as already loaded', async () => {
    getBranchMonthly.mockResolvedValueOnce(report(['2026-10'])).mockResolvedValueOnce(report(['2025-11', '2026-10']));
    await useAnalyticsStore.getState().load('b1', SIX);
    await useAnalyticsStore.getState().load('b1', SIX);
    await useAnalyticsStore.getState().load('b1', TWELVE);
    expect(getBranchMonthly).toHaveBeenCalledTimes(2);
    expect(useAnalyticsStore.getState().loadedFor).toBe(analyticsKey('b1', TWELVE));
  });

  it('refreshes the window it has, and keeps the report when that fails', async () => {
    getBranchMonthly.mockResolvedValueOnce(report(['2026-10'])).mockRejectedValueOnce(new Error('offline'));
    await useAnalyticsStore.getState().load('b1', SIX);
    await useAnalyticsStore.getState().refresh();
    expect(getBranchMonthly).toHaveBeenLastCalledWith('b1', SIX);
    expect(useAnalyticsStore.getState().report?.months).toEqual(['2026-10']);
    expect(useAnalyticsStore.getState().error).toBeTruthy();
  });
});
