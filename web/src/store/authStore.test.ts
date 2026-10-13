import { beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipAs, userWith } from '@/test/fixtures';
import type { Business } from '@/types/business';

const getBusiness = vi.fn<(id: string) => Promise<Business>>();
const deleteAccount = vi.fn<(password: string) => Promise<{ deletedBusinessIds: string[] }>>();

vi.mock('@/api/business', () => ({
  getBusiness: (id: string) => getBusiness(id),
  createBusiness: vi.fn(),
  listBranches: vi.fn(),
  getSalesSummary: vi.fn(),
}));
vi.mock('@/api/auth', () => ({
  deleteAccount: (password: string) => deleteAccount(password),
  fetchSession: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
}));

const { useAuthStore } = await import('./authStore');

const owner = { ...membershipAs('OWNER'), businessId: 'b1' };
const cashier = { ...membershipAs('CASHIER'), id: 'm2', businessId: 'b2' };
const revoked = { ...membershipAs('MANAGER', 'REVOKED'), id: 'm3', businessId: 'b3' };

describe('authStore', () => {
  beforeEach(() => {
    getBusiness.mockReset();
    deleteAccount.mockReset();
    useAuthStore.setState({
      token: 'tok',
      user: userWith([owner, cashier, revoked]),
      business: { id: 'b1', name: 'Apex' } as Business,
      activeBusinessId: 'b1',
      isSwitchingBusiness: false,
      error: null,
    });
  });

  it('switches to another active membership once its business has loaded', async () => {
    getBusiness.mockResolvedValue({ id: 'b2', name: 'Chai Point' } as Business);
    await useAuthStore.getState().switchBusiness('b2');
    expect(useAuthStore.getState().activeBusinessId).toBe('b2');
    expect(useAuthStore.getState().business?.name).toBe('Chai Point');
  });

  it('refuses a business the account was revoked from', async () => {
    await useAuthStore.getState().switchBusiness('b3');
    expect(getBusiness).not.toHaveBeenCalled();
    expect(useAuthStore.getState().activeBusinessId).toBe('b1');
  });

  it('stays where it was when the switch fails', async () => {
    getBusiness.mockRejectedValue(new Error('offline'));
    await expect(useAuthStore.getState().switchBusiness('b2')).rejects.toThrow();
    expect(useAuthStore.getState().activeBusinessId).toBe('b1');
    expect(useAuthStore.getState().isSwitchingBusiness).toBe(false);
  });

  it('signs out after deleting the account, and stays signed in when it is refused', async () => {
    deleteAccount.mockRejectedValueOnce(new Error('wrong password'));
    await expect(useAuthStore.getState().deleteAccount('nope')).rejects.toThrow();
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().error).toBeTruthy();

    deleteAccount.mockResolvedValueOnce({ deletedBusinessIds: ['b1'] });
    await useAuthStore.getState().deleteAccount('right');
    expect(useAuthStore.getState().token).toBeNull();
  });
});
