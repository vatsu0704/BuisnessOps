const { Prisma } = require('@prisma/client');
const prisma = require('../config/db');
const { fail } = require('../errors');

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

async function listItems(businessId, { includeInactive = false, search } = {}) {
  return prisma.inventoryItem.findMany({
    where: {
      businessId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

async function getItem(businessId, inventoryItemId) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, businessId } });
  if (!item) throw fail('SUPPLY_ITEM_NOT_FOUND', 404);
  return item;
}

async function createItem(businessId, { name, unit, category, unitPrice, isActive }) {
  await assertNameFree(businessId, name);
  return prisma.inventoryItem.create({
    data: {
      businessId,
      name: name.trim(),
      unit: unit.trim(),
      category: category?.trim() || null,
      unitPrice: toDecimal(unitPrice),
      isActive: isActive ?? true,
    },
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

  return prisma.inventoryItem.update({
    where: { id: item.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.unit !== undefined ? { unit: data.unit.trim() } : {}),
      ...(data.category !== undefined ? { category: data.category?.trim() || null } : {}),
      ...(data.unitPrice !== undefined ? { unitPrice: toDecimal(data.unitPrice) } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
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
  const item = await client.inventoryItem.findFirst({ where: { id: inventoryItemId, businessId } });
  if (!item) throw fail('SUPPLY_ITEM_NOT_FOUND', 404);
  if (!item.isActive) throw fail('SUPPLY_ITEM_INACTIVE', 400, { name: item.name });
  if (item.unitPrice === null) throw fail('SUPPLY_ITEM_HAS_NO_PRICE', 400, { name: item.name });
  return item;
}

module.exports = { listItems, getItem, createItem, updateItem, resolveOrderable };
