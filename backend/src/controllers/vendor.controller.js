const vendorService = require('../services/vendor.service');
const { validationFailure } = require('../errors');
const {
  validateCreateVendor,
  validateUpdateVendor,
  validateSetUpi,
} = require('../validations/vendor.validation');

/**
 * Vendors and where payments go — requirements 25 and 26.
 *
 * No branch scoping in here: a vendor, like a catalog item, belongs to the
 * whole business, and so does the warehouse's UPI ID.
 */

async function listVendors(req, res, next) {
  try {
    const vendors = await vendorService.listVendors(req.tenant.businessId, {
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json(vendors);
  } catch (err) {
    next(err);
  }
}

async function createVendor(req, res, next) {
  try {
    const errors = validateCreateVendor(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const vendor = await vendorService.createVendor(req.tenant.businessId, {
      name: req.body.name,
      phone: req.body.phone,
    });
    res.status(201).json(vendor);
  } catch (err) {
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const errors = validateUpdateVendor(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    // Picked field by field rather than passing the body through, so nothing
    // this route is not allowed to write — a `upiId`, above all — can reach the
    // service by riding along in the request.
    const vendor = await vendorService.updateVendor(req.tenant.businessId, req.params.vendorId, {
      name: req.body.name,
      phone: req.body.phone,
      isActive: req.body.isActive,
    });
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function setVendorUpi(req, res, next) {
  try {
    const errors = validateSetUpi(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const vendor = await vendorService.setUpi(req.tenant.businessId, req.params.vendorId, {
      upiId: req.body.upiId,
      upiName: req.body.upiName,
      membershipId: req.tenant.membershipId,
    });
    res.json(vendor);
  } catch (err) {
    next(err);
  }
}

async function getPaymentAccount(req, res, next) {
  try {
    res.json(await vendorService.getPaymentAccount(req.tenant.businessId));
  } catch (err) {
    next(err);
  }
}

async function setPaymentAccount(req, res, next) {
  try {
    const errors = validateSetUpi(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const account = await vendorService.setPaymentAccount(req.tenant.businessId, {
      upiId: req.body.upiId,
      upiName: req.body.upiName,
      membershipId: req.tenant.membershipId,
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVendors,
  createVendor,
  updateVendor,
  setVendorUpi,
  getPaymentAccount,
  setPaymentAccount,
};
