import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashierConflicts, PendingInvite, TeamMember } from '@/types/team';

const listMemberships = vi.fn<(businessId: string) => Promise<TeamMember[]>>();
const listInvites = vi.fn<(businessId: string) => Promise<PendingInvite[]>>();
const listCashierConflicts = vi.fn<(businessId: string) => Promise<CashierConflicts>>();
vi.mock('@/api/team', () => ({
  listMemberships: (id: string) => listMemberships(id),
  listInvites: (id: string) => listInvites(id),
  listCashierConflicts: (id: string) => listCashierConflicts(id),
}));

const { useTeamStore } = await import('./teamStore');

const member = (id: string): TeamMember => ({
  id,
  role: 'STAFF',
  status: 'ACTIVE',
  user: { id: `u-${id}`, name: id, email: `${id}@example.com` },
  branchAccess: [],
});
const NO_CONFLICTS: CashierConflicts = { sharedBranches: [], misassignedCashiers: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('teamStore', () => {
  beforeEach(() => {
    listMemberships.mockReset();
    listInvites.mockReset().mockResolvedValue([]);
    listCashierConflicts.mockReset().mockResolvedValue(NO_CONFLICTS);
    useTeamStore.getState().reset();
  });

  it('asks once when Team and Invite load the same business together', async () => {
    listMemberships.mockResolvedValue([member('hari')]);
    await Promise.all([useTeamStore.getState().load('b1'), useTeamStore.getState().load('b1')]);
    expect(listMemberships).toHaveBeenCalledTimes(1);
    expect(useTeamStore.getState().members.map((m) => m.id)).toEqual(['hari']);
  });

  it('does not ask again on a later load of the same business — refresh does', async () => {
    listMemberships.mockResolvedValueOnce([member('hari')]).mockResolvedValueOnce([member('hari'), member('sita')]);
    await useTeamStore.getState().load('b1');
    await useTeamStore.getState().load('b1');
    expect(listMemberships).toHaveBeenCalledTimes(1);
    await useTeamStore.getState().refresh();
    expect(useTeamStore.getState().members).toHaveLength(2);
  });

  it('keeps the list it had when a refresh fails, and says why', async () => {
    listMemberships.mockResolvedValueOnce([member('hari')]);
    await useTeamStore.getState().load('b1');
    listMemberships.mockRejectedValueOnce(new Error('offline'));
    await useTeamStore.getState().refresh();
    expect(useTeamStore.getState().members.map((m) => m.id)).toEqual(['hari']);
    expect(useTeamStore.getState().error).toBeTruthy();
  });

  it("never files one business's people under another switched to meanwhile", async () => {
    const first = deferred<TeamMember[]>();
    listMemberships.mockReturnValueOnce(first.promise).mockResolvedValueOnce([member('sita')]);
    const slow = useTeamStore.getState().load('b1');
    await useTeamStore.getState().load('b2');
    first.resolve([member('hari')]);
    await slow;
    expect(useTeamStore.getState().loadedFor).toBe('b2');
    expect(useTeamStore.getState().members.map((m) => m.id)).toEqual(['sita']);
  });

  it('forgets everything on reset, as a sign-out needs', async () => {
    listMemberships.mockResolvedValueOnce([member('hari')]);
    await useTeamStore.getState().load('b1');
    useTeamStore.getState().reset();
    expect(useTeamStore.getState().members).toEqual([]);
    expect(useTeamStore.getState().loadedFor).toBeNull();
  });
});
