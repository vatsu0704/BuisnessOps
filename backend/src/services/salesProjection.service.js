const prisma = require('../config/db');

/**
 * The one way a sale gets written.
 *
 * `Transaction` + `LineItem` are the only sales fact table — PROJECT_FLOW's
 * Architecture Principle 4: every source writes into the same normalised
 * schema, and a new source is a new adapter rather than a schema change. CSV
 * upload was the first source; the counter (requirement 1) is the second, and
 * it would otherwise have grown its own copy of this and its own subtly
 * different idea of what a sale is.
 *
 * Extracted verbatim from `ingestion.service.js` with no behaviour change, so
 * `ingestion.test.js` remains the proof that it still does what it did.
 *
 * ## Why this shape
 *
 * `upsert by (branchId, externalId)` + `delete all line items` + `recreate`
 * makes the write **idempotent**: running it again with the same key converges
 * rather than duplicating. That is what lets a CSV be re-uploaded safely, and
 * it is also what makes "edit a counter order after it was placed" free —
 * editing just re-runs the projection.
 *
 * `LineItem.id` is therefore unstable across edits and the table churns. At a
 * counter's volume that is nothing; worth knowing, not worth solving.
 */

/**
 * Write one transaction and its lines, replacing whatever was there before
 * under the same `externalId`.
 *
 * `client` takes a Prisma transaction so a caller that must be atomic can be.
 * Ingestion deliberately passes none: a large file where most rows are good and
 * a few are bad should commit the good ones, which is what `SyncRunStatus.PARTIAL`
 * means. The counter passes one, because an order and its lines must never be
 * half-written.
 */
async function writeTransaction({ branchId, externalId, header, items }, client = prisma) {
  const existing = externalId
    ? await client.transaction.findUnique({ where: { branchId_externalId: { branchId, externalId } } })
    : null;

  const data = { ...header, branchId, externalId };

  let transaction;
  let created = false;
  if (existing) {
    // Replace rather than diff: the caller knows the whole line set, and
    // reconciling row-by-row is more code for an outcome nobody can tell apart.
    await client.lineItem.deleteMany({ where: { transactionId: existing.id } });
    transaction = await client.transaction.update({ where: { id: existing.id }, data });
  } else {
    transaction = await client.transaction.create({ data });
    created = true;
  }

  for (const item of items) {
    await client.lineItem.create({
      data: {
        transactionId: transaction.id,
        productId: item.productId ?? null,
        productNameSnapshot: item.productNameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        costPriceSnapshot: item.costPriceSnapshot ?? null,
      },
    });
  }

  return { transaction, created };
}

/**
 * The external id a counter order projects under.
 *
 * Namespaced so it can never collide with an id that came out of somebody's
 * POS export, and reversible so a Transaction row can be traced back to the
 * order that produced it without another column.
 */
function counterExternalId(counterOrderId) {
  return `counter:${counterOrderId}`;
}

module.exports = { writeTransaction, counterExternalId };
