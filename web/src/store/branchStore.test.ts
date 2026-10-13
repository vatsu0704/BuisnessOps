import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Branch } from '@/types/branch';

const listBranches = vi.fn<(businessId: string) => Promise<Branch[]>>();
vi.mock('@/api/business', () => ({ listBranches: (id: string) => listBranches(id) }));

const { useBranchStore } = await import('./branchStore');

const branch = (id: string) => ({ id, name: id }) as Branch;

describe('branchStore', () => {
  beforeEach(() => {
    listBranches.mockReset();
    useBranchStore.getState().reset();
  });

  it('asks once when several components load the same business together', async () => {
    listBranches.mockResolvedValue([branch('a')]);
    await Promise.all([useBranchStore.getState().load('b1'), useBranchStore.getState().load('b1')]);
    expect(listBranches).toHaveBeenCalledTimes(1);
    expect(useBranchStore.getState().loadedFor).toBe('b1');
  });

  it('keeps the list it had when a refresh fails, and says why', async () => {
    listBranches.mockResolvedValueOnce([branch('a')]);
    await useBranchStore.getState().load('b1');
    listBranches.mockRejectedValueOnce(new Error('offline'));
    await useBranchStore.getState().refresh();
    expect(useBranchStore.getState().branches).toHaveLength(1);
    expect(useBranchStore.getState().error).toBeTruthy();
  });

  it('refetches on fetchNow even when the list is already loaded', async () => {
    listBranches.mockResolvedValueOnce([branch('a')]).mockResolvedValueOnce([branch('a'), branch('b')]);
    await useBranchStore.getState().load('b1');
    await useBranchStore.getState().fetchNow('b1');
    expect(listBranches).toHaveBeenCalledTimes(2);
    expect(useBranchStore.getState().branches).toHaveLength(2);
  });

  it('loads afresh for another business', async () => {
    listBranches.mockResolvedValueOnce([branch('a')]).mockResolvedValueOnce([branch('x'), branch('y')]);
    await useBranchStore.getState().load('b1');
    await useBranchStore.getState().load('b2');
    expect(useBranchStore.getState().loadedFor).toBe('b2');
    expect(useBranchStore.getState().branches).toHaveLength(2);
  });
});
