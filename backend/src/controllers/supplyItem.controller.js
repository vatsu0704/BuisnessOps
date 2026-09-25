const supplyItemService = require('../services/supplyItem.service');
const { validationFailure } = require('../errors');
const { validateCreateItem, validateUpdateItem } = require('../validations/supply.validation');

/**
 * The raw-material catalog.
 *
 * No branch scoping anywhere in here, and that is not an omission: unlike
 * `Product`, an `InventoryItem` is business-wide by design. The warehouse
 * stocks one list and charges one price; a branch orders from it.
 */

async function listItems(req, res, next) {
  try {
    const items = await supplyItemService.listItems(req.tenant.businessId, {
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function getItem(req, res, next) {
  try {
    res.json(await supplyItemService.getItem(req.tenant.businessId, req.params.inventoryItemId));
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const errors = validateCreateItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const item = await supplyItemService.createItem(req.tenant.businessId, req.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const errors = validateUpdateItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const item = await supplyItemService.updateItem(
      req.tenant.businessId,
      req.params.inventoryItemId,
      req.body
    );
    res.json(item);
  } catch (err) {
    next(err);
  }
}

module.exports = { listItems, getItem, createItem, updateItem };
