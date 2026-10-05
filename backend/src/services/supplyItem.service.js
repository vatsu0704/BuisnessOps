const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');
const vendorService = require('./vendor.service');

/**
 * The raw-material catalog — the first half of requirement 5.
 *
 * `InventoryItem` has been in the schema since Phase 1 with no API at all; it
 * existed to record usage and wastage. Requirement 5 gives it the job it was
 * shaped for: this is the list a branch orders from.
 *
 * Deliberately business-wide, unlike `Product`, which grew a nullable
 * `branchId` in requirement 4. A branch sells its own menu, so its products are
 * its own; it does not keep a private list of flour. One warehouse, one
 * catalog, one price.
 */

/** Money as Decimal. A float price multiplied by a quantity is a wrong total. */
function toDecimal(value) {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

/**
 * Is this name already in the catalog?
 *
 * A service-level check rather than a unique index, following the precedent the
 * `Holiday` model sets in schema.prisma: the useful constraint here is
 * case-insensitive ("Flour" and "flour" are the same sack), Prisma 5 cannot
 * express a functional unique index, and hand-adding one in SQL would leave
 * permanent drift between the schema file and the database.
 *
 * So this is a courtesy, not a guarantee — two simultaneous creates can still
 * both land. That costs a duplicate row someone can deactivate, which is the
 * right price for not lying about what the database enforces.
 */
async function assertNameFree(businessId, name, exceptId = null) {
  const clash = await prisma.inventoryItem.findFirst({
    where: {
      businessId,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) throw fail('SUPPLY_ITEM_NAME_TAKEN', 409, { name: clash.name });
}

/**
 * Who supplies each item travels with it, because the catalog screen groups by
 * supplier and the cart splits by it (requirement 25). Name and active state
 * only — where a payment to the vendor goes is the order's business, not the
 * catalog's.
 */
const ITEM_INCLUDE = { vendor: { select: { id: true, name: true, isActive: true } } };

async function listItems(businessId, { includeInactive = false, search } = {}) {
  return prisma.inventoryItem.findMany({
    where: {
      businessId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    include: ITEM_INCLUDE,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

async function getItem(businessId, inventoryItemId) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, businessId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw fail('SUPPLY_ITEM_NOT_FOUND', 404);
  return item;
}

/**
 * The supplier an item may be given: a vendor of this business that has not
 * been withdrawn, or null for the warehouse. `undefined` means "not being
 * changed" and is passed straight through.
 */
async function resolveSupplier(businessId, vendorId) {
  if (vendorId === undefined || vendorId === null) return vendorId;
  const vendor = await vendorService.resolveActiveVendor(businessId, vendorId);
  return vendor.id;
}

async function createItem(businessId, { name, unit, category, unitPrice, vendorId, isActive }) {
  await assertNameFree(businessId, name);
  const supplier = await resolveSupplier(businessId, vendorId);
  return prisma.inventoryItem.create({
    data: {
      businessId,
      name: name.trim(),
      unit: unit.trim(),
      category: category?.trim() || null,
      unitPrice: toDecimal(unitPrice),
      vendorId: supplier ?? null,
      isActive: isActive ?? true,
    },
    include: ITEM_INCLUDE,
  });
}

/**
 * Edit an item.
 *
 * `unitPrice: null` is a meaningful update — it withdraws the price, which
 * makes the item un-orderable without deactivating it. That is the difference
 * between "we have stopped supplying this" and "we have not settled on a price
 * yet", and both are real states.
 */
async function updateItem(businessId, inventoryItemId, data) {
  const item = await getItem(businessId, inventoryItemId);
  if (data.name !== undefined) await assertNameFree(businessId, data.name, item.id);
  // Changing the supplier moves where the item is ordered FROM next time. Lines
  // already in a cart follow it at placement, because the cart is split by each
  // item's supplier at that moment; orders already placed are untouched.
  const supplier = await resolveSupplier(businessId, data.vendorId);

  return prisma.inventoryItem.update({
    where: { id: item.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.unit !== undefined ? { unit: data.unit.trim() } : {}),
      ...(data.category !== undefined ? { category: data.category?.trim() || null } : {}),
      ...(data.unitPrice !== undefined ? { unitPrice: toDecimal(data.unitPrice) } : {}),
      ...(supplier !== undefined ? { vendorId: supplier } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: ITEM_INCLUDE,
  });
}

/**
 * The item as it can be ordered right now, or a refusal.
 *
 * Both conditions are checked in one place because both are ways of saying "not
 * available", and splitting them across the call sites is how one of them ends
 * up missing from a path that needs it. An unpriced item is refused rather than
 * ordered at zero — a free sack of flour in the figures is worse than an error.
 */
async function resolveOrderable(businessId, inventoryItemId, client = prisma) {
  const item = await client.inventoryItem.findFirst({
    where: { id: inventoryItemId, businessId },
    include: ITEM_INCLUDE,
  });
  if (!item) throw fail('SUPPLY_ITEM_NOT_FOUND', 404);
  if (!item.isActive) throw fail('SUPPLY_ITEM_INACTIVE', 400, { name: item.name });
  if (item.unitPrice === null) throw fail('SUPPLY_ITEM_HAS_NO_PRICE', 400, { name: item.name });
  // A third way of being unavailable: the item is fine, but whoever supplies it
  // has been withdrawn, and an order to them would go to nobody.
  if (item.vendor && !item.vendor.isActive) throw fail('SUPPLY_VENDOR_INACTIVE', 400, { name: item.vendor.name });
  return item;
}

module.exports = { listItems, getItem, createItem, updateItem, resolveOrderable };
