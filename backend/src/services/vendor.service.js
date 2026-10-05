const prisma = require('../config/db');
const { fail } = require('../errors');

/**
 * Third-party vendors — requirement 25 — and where a payment to each one goes.
 *
 * A vendor supplies some raw material directly (the water in the original
 * sketch) instead of the warehouse supplying it from stock. They do not use the
 * app: an order reaches them over WhatsApp and the branch says when the goods
 * arrived. So what this service holds about them is only what the business
 * needs to order from them and pay them — a name, a phone number, a UPI ID.
 *
 * ## Two halves, two capabilities
 *
 * Name, phone and withdrawing are the warehouse desk's, under
 * `supplyItem:manage`: vendors are part of the catalog the desk already runs.
 * The UPI ID is NOT. `setUpi` sits behind `paymentAccount:manage`, which the
 * desk deliberately does not hold, because the UPI ID decides whose account
 * the money lands in and changing it is the one edit in this app that could
 * quietly redirect it. Who changed it and when is recorded on the row and shown
 * on the screen for the same reason.
 */

const UPI_UPDATED_BY = {
  select: { id: true, user: { select: { id: true, name: true } } },
};

const VENDOR_SELECT = {
  id: true,
  businessId: true,
  name: true,
  phone: true,
  upiId: true,
  upiName: true,
  upiUpdatedAt: true,
  upiUpdatedByMembership: UPI_UPDATED_BY,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Is this name already taken in this business?
 *
 * Case-insensitive, the same courtesy check the raw-material catalog makes:
 * "Shree Water" and "shree water" are one supplier, and a second row would
 * split their orders and their bill. The unique index on (businessId, name)
 * still catches an exact duplicate that races past this.
 */
async function assertNameFree(businessId, name, exceptId = null) {
  const clash = await prisma.vendor.findFirst({
    where: {
      businessId,
      name: { equals: name.trim(), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw fail('VENDOR_NAME_TAKEN', 409, { name: clash.name });
}

async function listVendors(businessId, { includeInactive = false } = {}) {
  return prisma.vendor.findMany({
    where: { businessId, ...(includeInactive ? {} : { isActive: true }) },
    select: VENDOR_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

async function getVendor(businessId, vendorId, client = prisma) {
  const vendor = await client.vendor.findFirst({ where: { id: vendorId, businessId }, select: VENDOR_SELECT });
  if (!vendor) throw fail('VENDOR_NOT_FOUND', 404);
  return vendor;
}

/**
 * A vendor an item may be assigned to, or a refusal.
 *
 * Withdrawn vendors are refused rather than silently accepted: an item pointing
 * at a supplier the business has stopped using would be orderable, and the
 * order would go to nobody.
 */
async function resolveActiveVendor(businessId, vendorId, client = prisma) {
  const vendor = await getVendor(businessId, vendorId, client);
  if (!vendor.isActive) throw fail('SUPPLY_VENDOR_INACTIVE', 400, { name: vendor.name });
  return vendor;
}

async function createVendor(businessId, { name, phone }) {
  await assertNameFree(businessId, name);
  return prisma.vendor.create({
    data: { businessId, name: name.trim(), phone: phone?.trim() || null },
    select: VENDOR_SELECT,
  });
}

/** Name, phone and withdrawing — the desk's half. Never the UPI ID. */
async function updateVendor(businessId, vendorId, data) {
  const vendor = await getVendor(businessId, vendorId);
  if (data.name !== undefined) await assertNameFree(businessId, data.name, vendor.id);

  return prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    select: VENDOR_SELECT,
  });
}

/**
 * Where a payment to this vendor goes — the accountant's half.
 *
 * `upiId: null` clears it, which turns off "pay now" for this vendor's items
 * until a new one is set; it does not stop the vendor being ordered from. Every
 * write stamps who and when, including a clear.
 */
async function setUpi(businessId, vendorId, { upiId, upiName, membershipId }) {
  const vendor = await getVendor(businessId, vendorId);
  return prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      upiId: upiId ? normaliseUpiId(upiId) : null,
      upiName: upiId ? upiName?.trim() || null : null,
      upiUpdatedAt: new Date(),
      upiUpdatedByMembershipId: membershipId ?? null,
    },
    select: VENDOR_SELECT,
  });
}

// --- The warehouse's own payee ---------------------------------------------

/**
 * Where a payment for WAREHOUSE stock goes.
 *
 * One per business, held on the business row. It is read by every warehouse
 * order's QR code — on the cashier's phone when they pay before placing, and on
 * the delivery agent's when the branch pays on delivery.
 */
async function getPaymentAccount(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      supplyUpiId: true,
      supplyUpiName: true,
      supplyUpiUpdatedAt: true,
      supplyUpiUpdatedByMembership: UPI_UPDATED_BY,
    },
  });
  if (!business) throw fail('BUSINESS_NOT_FOUND', 404);
  return {
    businessName: business.name,
    upiId: business.supplyUpiId,
    upiName: business.supplyUpiName,
    upiUpdatedAt: business.supplyUpiUpdatedAt,
    upiUpdatedByMembership: business.supplyUpiUpdatedByMembership,
  };
}

async function setPaymentAccount(businessId, { upiId, upiName, membershipId }) {
  await prisma.business.update({
    where: { id: businessId },
    data: {
      supplyUpiId: upiId ? normaliseUpiId(upiId) : null,
      supplyUpiName: upiId ? upiName?.trim() || null : null,
      supplyUpiUpdatedAt: new Date(),
      supplyUpiUpdatedByMembershipId: membershipId ?? null,
    },
  });
  return getPaymentAccount(businessId);
}

/**
 * Trimmed and lower-cased. UPI addresses are case-insensitive, and storing one
 * spelling means "is this the same ID?" is a string comparison everywhere.
 */
function normaliseUpiId(upiId) {
  return upiId.trim().toLowerCase();
}

module.exports = {
  listVendors,
  getVendor,
  resolveActiveVendor,
  createVendor,
  updateVendor,
  setUpi,
  getPaymentAccount,
  setPaymentAccount,
};
