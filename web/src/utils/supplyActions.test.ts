import { describe, expect, it } from 'vitest';
import {
  cashOutstanding,
  supplyOrderActions,
  vendorOrderLines,
  type SupplyCapabilities,
} from '@shared/utils/supplyActions';
import { groupBySupplier, groupCatalog, quantitiesInCart } from '@shared/utils/supplyGroups';
import { supplyPaymentKey, supplyStatusKey } from '@shared/utils/supplyStatus';
import { whatsAppNumber, whatsAppUrl } from '@shared/utils/whatsappNumber';
import { roleHas } from '@/permissions';
import type { SupplyItem, SupplyOrder, SupplyOrderItem } from '@/types/supply';
import type { MembershipRole } from '@/types/user';

/**
 * The supply rules both apps read (`frontend/src/utils/supply*.ts`): which buttons
 * an order offers, how a cart splits, how a status reads. The capabilities come
 * from the matrix, so a role moved in the backend catalog moves these with it.
 */

function capsOf(role: MembershipRole): SupplyCapabilities {
  return {
    fulfil: roleHas(role, 'supplyOrder:fulfil'),
    deliver: roleHas(role, 'supplyOrder:deliver'),
    delay: roleHas(role, 'supplyOrder:delay'),
    order: roleHas(role, 'supplyOrder:create'),
    receive: roleHas(role, 'supplyOrder:receive'),
    verify: roleHas(role, 'supplyPayment:verify'),
  };
}

const vendor = { id: 'v1', name: 'Shree Water', phone: '98250 12345', upiId: null, upiName: null, isActive: true };

function order(overrides: Partial<SupplyOrder> = {}): SupplyOrder {
  return {
    id: 'o1',
    businessId: 'b1',
    branchId: 'sg',
    branch: null,
    vendorId: null,
    vendor: null,
    business: null,
    operatingModel: 'FM',
    placementId: null,
    orderNumber: 214,
    status: 'PLACED',
    totalAmount: '2400.00',
    currency: 'INR',
    paymentMode: 'COD',
    paymentStatus: 'PENDING',
    paymentReference: null,
    paymentVerifiedAt: null,
    promisedAt: null,
    placedByMembership: null,
    deliveryAgentMembership: null,
    placedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: '',
    updatedAt: '',
    items: [],
    events: [],
    ...overrides,
  };
}

const fromVendor = (overrides: Partial<SupplyOrder> = {}) => order({ vendorId: 'v1', vendor, ...overrides });

describe('supplyOrderActions — the warehouse order', () => {
  it('walks the desk through accept, pack and dispatch, one step at a time', () => {
    const desk = capsOf('WAREHOUSE');
    expect(supplyOrderActions(order({ status: 'PLACED' }), desk).primary).toBe('accept');
    expect(supplyOrderActions(order({ status: 'ACCEPTED' }), desk).primary).toBe('pack');
    expect(supplyOrderActions(order({ status: 'PACKED' }), desk).primary).toBe('dispatch');
    // The desk does not carry it.
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), desk).primary).toBeNull();
  });

  it('asks the agent about the money only when it is still owed', () => {
    const agent = capsOf('DELIVERY_AGENT');
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), agent).primary).toBe('collect');
    expect(supplyOrderActions(order({ status: 'DISPATCHED', paymentMode: 'ONLINE', paymentStatus: 'PAID' }), agent).primary).toBe(
      'deliver'
    );
    expect(supplyOrderActions(order({ status: 'DISPATCHED', operatingModel: 'FOCO', paymentMode: 'ACCOUNTS' }), agent).primary).toBe(
      'deliver'
    );
  });

  it('lets the branch pay again once the warehouse says a payment never came — never early for pay on delivery', () => {
    const cashier = capsOf('CASHIER');
    expect(supplyOrderActions(order({ paymentMode: 'ONLINE', paymentStatus: 'FAILED' }), cashier).primary).toBe('pay');
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), cashier).primary).toBeNull();
    // Accounts pays a company-operated branch's order; nothing for the cashier to pay.
    expect(
      supplyOrderActions(order({ operatingModel: 'FOCO', paymentMode: 'ACCOUNTS', paymentStatus: 'FAILED' }), cashier).primary
    ).toBeNull();
  });

  it('offers cancel only before the warehouse has taken it on', () => {
    const cashier = capsOf('CASHIER');
    expect(supplyOrderActions(order({ status: 'PLACED' }), cashier).cancel).toBe(true);
    expect(supplyOrderActions(order({ status: 'ACCEPTED' }), cashier).cancel).toBe(false);
  });

  it('lets the desk reject until it is packed, and change the carrier until it is delivered', () => {
    const desk = capsOf('WAREHOUSE');
    expect(supplyOrderActions(order({ status: 'PACKED' }), desk).reject).toBe(true);
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), desk).reject).toBe(false);
    expect(supplyOrderActions(order({ status: 'PLACED' }), desk).reassign).toBe(false);
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), desk).reassign).toBe(true);
    expect(supplyOrderActions(order({ status: 'DELIVERED' }), desk).reassign).toBe(false);
  });

  it('confirms money that came to the warehouse, with "not received" only for a payment claimed', () => {
    const accountant = capsOf('ACCOUNTANT');
    const claimed = supplyOrderActions(order({ paymentMode: 'ONLINE', paymentStatus: 'PAID' }), accountant);
    expect([claimed.verify, claimed.verifyFailed]).toEqual([true, true]);
    const failed = supplyOrderActions(order({ paymentMode: 'ONLINE', paymentStatus: 'FAILED' }), accountant);
    expect([failed.verify, failed.verifyFailed]).toEqual([true, false]);
    expect(supplyOrderActions(order({ paymentMode: 'ONLINE', paymentStatus: 'PAID' }), capsOf('CASHIER')).verify).toBe(false);
  });

  it('takes delays from either end while the order is on its way', () => {
    expect(supplyOrderActions(order({ status: 'DISPATCHED' }), capsOf('DELIVERY_AGENT')).delay).toBe(true);
    expect(supplyOrderActions(order({ status: 'DELIVERED' }), capsOf('DELIVERY_AGENT')).delay).toBe(false);
    expect(supplyOrderActions(order({ status: 'PLACED' }), capsOf('CASHIER')).delay).toBe(false);
  });
});

describe('supplyOrderActions — a vendor order', () => {
  it('has the desk forward a company-operated branch’s order, and the branch receive it', () => {
    const foco = fromVendor({ operatingModel: 'FOCO', paymentMode: 'ACCOUNTS' });
    expect(supplyOrderActions(foco, capsOf('WAREHOUSE')).primary).toBe('sendToVendor');
    expect(supplyOrderActions(foco, capsOf('WAREHOUSE')).whatsapp).toBe(true);
    expect(supplyOrderActions(foco, capsOf('CASHIER')).primary).toBe('receive');
    expect(supplyOrderActions(foco, capsOf('CASHIER')).whatsapp).toBe(false);
  });

  it('has a franchise branch send it itself, and asks whether the vendor was paid on arrival', () => {
    const fm = fromVendor();
    const cashier = supplyOrderActions(fm, capsOf('CASHIER'));
    expect(cashier.primary).toBe('receiveAsk');
    expect(cashier.whatsapp).toBe(true);
    // The desk never sees a franchise's vendor order as its own to forward or reject.
    const desk = supplyOrderActions(fm, capsOf('WAREHOUSE'));
    expect([desk.primary, desk.reject, desk.whatsapp]).toEqual([null, false, false]);
  });

  it('leaves a Pay button on goods received but not yet paid for, and never a carrier to change', () => {
    const received = fromVendor({ status: 'DELIVERED' });
    expect(supplyOrderActions(received, capsOf('CASHIER')).primary).toBe('pay');
    expect(supplyOrderActions(fromVendor({ status: 'ACCEPTED', operatingModel: 'FOCO' }), capsOf('WAREHOUSE')).reassign).toBe(
      false
    );
  });

  it('offers no WhatsApp without a number to send to', () => {
    expect(supplyOrderActions(fromVendor({ vendor: { ...vendor, phone: null } }), capsOf('CASHIER')).whatsapp).toBe(false);
  });
});

describe('the pieces around it', () => {
  it('owes cash only on a pay-on-delivery order nobody has paid', () => {
    expect(cashOutstanding(order())).toBe(true);
    expect(cashOutstanding(order({ paymentStatus: 'PAID' }))).toBe(false);
    expect(cashOutstanding(order({ paymentMode: 'ONLINE' }))).toBe(false);
  });

  it('words a vendor’s accepted and delivered as sent and received', () => {
    expect(supplyStatusKey('ACCEPTED', true)).toBe('supplyStatus.SENT_TO_VENDOR');
    expect(supplyStatusKey('DELIVERED', true)).toBe('supplyStatus.RECEIVED');
    expect(supplyStatusKey('ACCEPTED', false)).toBe('supplyStatus.ACCEPTED');
    expect(supplyPaymentKey('PENDING', 'COD')).toBe('supply.payCod');
    expect(supplyPaymentKey('VERIFIED', 'ACCOUNTS')).toBe('supply.paidByAccounts');
    expect(supplyPaymentKey('PAID', 'ONLINE')).toBe('supplyPayment.PAID');
  });

  it('addresses a ten-digit number as Indian, and refuses one too short to send to', () => {
    expect(whatsAppNumber('98250 12345')).toBe('919825012345');
    expect(whatsAppNumber('+44 20 7946 0958')).toBe('442079460958');
    expect(whatsAppNumber('12345')).toBeNull();
    expect(whatsAppUrl('98250 12345', 'Order #214\n• Milk')).toBe('https://wa.me/919825012345?text=Order%20%23214%0A%E2%80%A2%20Milk');
  });

  it('lists an order for the vendor as one line per item', () => {
    const line = (name: string, quantity: string, unit: string) =>
      ({ itemNameSnapshot: name, quantity, unitSnapshot: unit }) as SupplyOrderItem;
    expect(vendorOrderLines(order({ items: [line('Milk', '20.000', 'litre'), line('Ice', '2.5', 'kg')] }))).toBe(
      '• Milk × 20 litre\n• Ice × 2.5 kg'
    );
  });
});

describe('supplyGroups', () => {
  const cartLine = (id: string, vendorName: string | null, total: string): SupplyOrderItem => ({
    id,
    inventoryItemId: `i-${id}`,
    inventoryItem: vendorName
      ? { vendorId: vendorName, vendor: { ...vendor, id: vendorName, name: vendorName } }
      : { vendorId: null, vendor: null },
    itemNameSnapshot: id,
    unitSnapshot: 'kg',
    quantity: '2',
    unitPrice: '1',
    lineTotal: total,
    createdAt: '',
  });

  it('splits a cart the way the server will: the warehouse first, then vendors by name', () => {
    const groups = groupBySupplier([cartLine('a', 'Zen Ice', '10'), cartLine('b', null, '20'), cartLine('c', 'Amul', '5'), cartLine('d', null, '1')]);
    expect(groups.map((g) => g.vendor?.name ?? 'WAREHOUSE')).toEqual(['WAREHOUSE', 'Amul', 'Zen Ice']);
    expect(groups[0].subtotal).toBe(21);
  });

  it('files the catalog by supplier then category, and searches by name', () => {
    const item = (id: string, name: string, category: string | null, vendorName: string | null = null): SupplyItem => ({
      id,
      businessId: 'b1',
      name,
      unit: 'kg',
      category,
      unitPrice: '10',
      vendorId: vendorName,
      vendor: vendorName ? { id: vendorName, name: vendorName, isActive: true } : null,
      isActive: true,
    });
    const items = [item('1', 'Tomato', 'Veg'), item('2', 'Milk', null, 'Amul'), item('3', 'Atta', 'Dry'), item('4', 'Onion', 'Veg')];
    const grouped = groupCatalog(items, { uncategorised: 'Other' });
    expect(grouped.map((s) => s.label)).toEqual([null, 'Amul']);
    expect(grouped[0].categories.map(([c]) => c)).toEqual(['Dry', 'Veg']);
    expect(grouped[1].categories[0][0]).toBe('Other');
    expect(groupCatalog(items, { search: 'ON', uncategorised: 'Other' })[0].categories[0][1].map((i) => i.name)).toEqual(['Onion']);
  });

  it('counts what the cart holds by catalog item', () => {
    expect(quantitiesInCart([cartLine('a', null, '1')]).get('i-a')).toBe(2);
    expect(quantitiesInCart(undefined).size).toBe(0);
  });
});
