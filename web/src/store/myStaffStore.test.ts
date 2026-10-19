import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyStaffMember } from '@/types/staffing';

const getMyStaffMember = vi.fn<(businessId: string) => Promise<MyStaffMember>>();
vi.mock('@/api/staff', () => ({ getMyStaffMember: (id: string) => getMyStaffMember(id) }));

const { useMyStaffStore } = await import('./myStaffStore');

const me = { id: 's1', branchId: 'b1', name: 'Hari' } as MyStaffMember;

function httpError(status: number) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('failed', String(status), config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data: {},
  });
}

describe('myStaffStore', () => {
  beforeEach(() => {
    getMyStaffMember.mockReset();
    useMyStaffStore.getState().reset();
  });

  it('holds the staff record of whoever is signed in', async () => {
    getMyStaffMember.mockResolvedValue(me);
    await useMyStaffStore.getState().load('biz');
    expect(useMyStaffStore.getState().staffMember?.id).toBe('s1');
    expect(useMyStaffStore.getState().loadedFor).toBe('biz');
  });

  it('takes a 404 as the answer "not on the staff here", not as a failure', async () => {
    getMyStaffMember.mockRejectedValue(httpError(404));
    await useMyStaffStore.getState().load('biz');
    expect(useMyStaffStore.getState().staffMember).toBeNull();
    expect(useMyStaffStore.getState().loadedFor).toBe('biz');
    expect(useMyStaffStore.getState().error).toBeNull();
  });

  it('reports any other failure, and keeps the record it had', async () => {
    getMyStaffMember.mockResolvedValueOnce(me).mockRejectedValueOnce(httpError(500));
    await useMyStaffStore.getState().load('biz');
    await useMyStaffStore.getState().refresh();
    expect(useMyStaffStore.getState().staffMember?.id).toBe('s1');
    expect(useMyStaffStore.getState().error).toBeTruthy();
  });

  it('asks once when Home and the Staff page ask together', async () => {
    getMyStaffMember.mockResolvedValue(me);
    await Promise.all([useMyStaffStore.getState().load('biz'), useMyStaffStore.getState().load('biz')]);
    expect(getMyStaffMember).toHaveBeenCalledTimes(1);
  });
});
