import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipAs, userWith } from '@/test/fixtures';
import type { Business } from '@/types/business';
import type { User } from '@/types/user';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const getBusiness = vi.fn<(id: string) => Promise<Business>>();
const deleteAccount = vi.fn<(password: string) => Promise<{ deletedBusinessIds: string[] }>>();
const fetchSession = vi.fn<() => Promise<{ user: User; business: Business | null }>>();

vi.mock('@/api/business', () => ({
  getBusiness: (id: string) => getBusiness(id),
  createBusiness: vi.fn(),
  listBranches: vi.fn(),
}));
vi.mock('@/api/auth', () => ({
  deleteAccount: (password: string) => deleteAccount(password),
  fetchSession: () => fetchSession(),
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

/** Requirement 30: the counter opens with no connection, from the last session the server confirmed. */
describe('authStore offline start', () => {
  const user = userWith([owner]);
  const business = { id: 'b1', name: 'Apex' } as Business;
  const noAnswer = new AxiosError('Network Error', 'ERR_NETWORK');
  const refused = () =>
    new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { code: 'AUTH_TOKEN_INVALID' },
    });

  beforeEach(() => {
    window.localStorage.clear();
    fetchSession.mockReset();
    useAuthStore.setState({ token: null, user: null, business: null, activeBusinessId: null, isOfflineSession: false });
  });

  it('keeps a copy of every session the server confirms', async () => {
    storage.set(STORAGE_KEYS.token, 'tok');
    fetchSession.mockResolvedValueOnce({ user, business });
    await useAuthStore.getState().bootstrap();
    const cached = JSON.parse(storage.get(STORAGE_KEYS.sessionCache) ?? 'null');
    expect(cached).toMatchObject({ token: 'tok', activeBusinessId: 'b1' });
  });

  it('opens from the copy when the server cannot be reached, for the same token only', async () => {
    storage.set(STORAGE_KEYS.token, 'tok');
    storage.set(STORAGE_KEYS.sessionCache, JSON.stringify({ token: 'tok', user, business, activeBusinessId: 'b1' }));
    fetchSession.mockRejectedValueOnce(noAnswer);
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState()).toMatchObject({ token: 'tok', activeBusinessId: 'b1', isOfflineSession: true });

    useAuthStore.setState({ token: null, user: null, isOfflineSession: false });
    storage.set(STORAGE_KEYS.sessionCache, JSON.stringify({ token: 'someone-else', user, business, activeBusinessId: 'b1' }));
    fetchSession.mockRejectedValueOnce(noAnswer);
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().token).toBeNull();
    // The token itself survives a server that did not answer.
    expect(storage.get(STORAGE_KEYS.token)).toBe('tok');
  });

  it('believes the server over the copy: a refusal drops both', async () => {
    storage.set(STORAGE_KEYS.token, 'tok');
    storage.set(STORAGE_KEYS.sessionCache, JSON.stringify({ token: 'tok', user, business, activeBusinessId: 'b1' }));
    fetchSession.mockRejectedValueOnce(refused());
    await useAuthStore.getState().bootstrap();
    expect(useAuthStore.getState().token).toBeNull();
    expect(storage.get(STORAGE_KEYS.token)).toBeNull();
    expect(storage.get(STORAGE_KEYS.sessionCache)).toBeNull();
  });

  it('is a live session again once a refresh gets through, and sign-out drops the copy', async () => {
    storage.set(STORAGE_KEYS.token, 'tok');
    storage.set(STORAGE_KEYS.sessionCache, JSON.stringify({ token: 'tok', user, business, activeBusinessId: 'b1' }));
    fetchSession.mockRejectedValueOnce(noAnswer);
    await useAuthStore.getState().bootstrap();
    fetchSession.mockResolvedValueOnce({ user, business });
    await useAuthStore.getState().refreshSession();
    expect(useAuthStore.getState().isOfflineSession).toBe(false);

    useAuthStore.getState().logout();
    expect(storage.get(STORAGE_KEYS.sessionCache)).toBeNull();
  });
});
