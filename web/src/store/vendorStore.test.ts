import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplyPaymentOrder, Vendor } from '@/types/supply';

const listVendors = vi.fn<(businessId: string) => Promise<Vendor[]>>();
const listPaymentsDue = vi.fn<(businessId: string) => Promise<SupplyPaymentOrder[]>>();
const listPaymentsToConfirm = vi.fn<(businessId: string) => Promise<SupplyPaymentOrder[]>>();
vi.mock('@/api/supply', () => ({
  listVendors: (id: string) => listVendors(id),
  listPaymentsDue: (id: string) => listPaymentsDue(id),
  listPaymentsToConfirm: (id: string) => listPaymentsToConfirm(id),
}));

const { useVendorStore } = await import('./vendorStore');
const { useSupplyPaymentStore } = await import('./supplyPaymentStore');

const vendor = (id: string): Vendor =>
  ({ id, businessId: 'b1', name: id, phone: null, upiId: null, isActive: true }) as Vendor;
const paymentOrder = (id: string): SupplyPaymentOrder => ({ id, status: 'DELIVERED' }) as SupplyPaymentOrder;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('vendorStore', () => {
  beforeEach(() => {
    listVendors.mockReset();
    useVendorStore.getState().reset();
  });

  it('asks once when two pages load the same business together, and again only on refresh', async () => {
    listVendors.mockResolvedValueOnce([vendor('amul')]).mockResolvedValueOnce([vendor('amul'), vendor('shree')]);
    await Promise.all([useVendorStore.getState().load('b1'), useVendorStore.getState().load('b1')]);
    await useVendorStore.getState().load('b1');
    expect(listVendors).toHaveBeenCalledTimes(1);
    await useVendorStore.getState().refresh();
    expect(useVendorStore.getState().vendors).toHaveLength(2);
  });

  it('keeps the list it had when a refresh fails, and says why', async () => {
    listVendors.mockResolvedValueOnce([vendor('amul')]).mockRejectedValueOnce(new Error('offline'));
    await useVendorStore.getState().load('b1');
    await useVendorStore.getState().refresh();
    expect(useVendorStore.getState().vendors.map((v) => v.id)).toEqual(['amul']);
    expect(useVendorStore.getState().error).toBeTruthy();
  });

  it("never files one business's vendors under another switched to meanwhile", async () => {
    const first = deferred<Vendor[]>();
    listVendors.mockReturnValueOnce(first.promise).mockResolvedValueOnce([vendor('shree')]);
    const slow = useVendorStore.getState().load('b1');
    await useVendorStore.getState().load('b2');
    first.resolve([vendor('amul')]);
    await slow;
    expect(useVendorStore.getState().loadedFor).toBe('b2');
    expect(useVendorStore.getState().vendors.map((v) => v.id)).toEqual(['shree']);
  });
});

describe('supplyPaymentStore', () => {
  beforeEach(() => {
    listPaymentsDue.mockReset().mockResolvedValue([paymentOrder('due')]);
    listPaymentsToConfirm.mockReset().mockResolvedValue([paymentOrder('confirm')]);
    useSupplyPaymentStore.getState().reset();
  });

  it('asks only for the lists this person may read — the desk never asks for "due"', async () => {
    await useSupplyPaymentStore.getState().load('b1', { due: false, toConfirm: true });
    expect(listPaymentsDue).not.toHaveBeenCalled();
    expect(useSupplyPaymentStore.getState().toConfirm.map((o) => o.id)).toEqual(['confirm']);
  });

  it('repeats the same choice on a refresh from the order page, and does nothing when never loaded', async () => {
    await useSupplyPaymentStore.getState().refresh();
    expect(listPaymentsToConfirm).not.toHaveBeenCalled();
    await useSupplyPaymentStore.getState().load('b1', { due: false, toConfirm: true });
    await useSupplyPaymentStore.getState().refresh();
    expect(listPaymentsToConfirm).toHaveBeenCalledTimes(2);
    expect(listPaymentsDue).not.toHaveBeenCalled();
  });

  it('keeps what it had when a refresh fails', async () => {
    await useSupplyPaymentStore.getState().load('b1', { due: true, toConfirm: true });
    listPaymentsDue.mockRejectedValueOnce(new Error('offline'));
    await useSupplyPaymentStore.getState().refresh();
    expect(useSupplyPaymentStore.getState().due.map((o) => o.id)).toEqual(['due']);
    expect(useSupplyPaymentStore.getState().error).toBeTruthy();
  });
});
