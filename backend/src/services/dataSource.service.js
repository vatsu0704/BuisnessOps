const prisma = require('../config/db');
const { fail } = require('../errors');
const { parseFileToRows, ingestRows } = require('./ingestion.service');
const { safeZone } = require('../utils/datetime');

function createDataSource(businessId, { branchId, provider, displayName, syncFrequency }) {
  return prisma.dataSourceConnection.create({
    data: {
      businessId,
      branchId: branchId || null,
      provider,
      displayName,
      syncFrequency: syncFrequency || 'MANUAL',
      status: 'PENDING',
    },
  });
}

function listDataSources(businessId) {
  return prisma.dataSourceConnection.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
}

function listSyncRuns(businessId, dataSourceConnectionId) {
  return prisma.syncRun.findMany({
    where: { dataSourceConnectionId, dataSourceConnection: { businessId } },
    orderBy: { startedAt: 'desc' },
  });
}

// Every upload is tied to one branch (the data source's own branchId) —
// there's no per-row branch column, keeping the first ingestion slice
// simple. A business-wide CSV channel isn't supported yet; create one
// data source per branch.
async function uploadFile(businessId, dataSourceConnectionId, file) {
  const dataSource = await prisma.dataSourceConnection.findFirst({
    where: { id: dataSourceConnectionId, businessId },
  });
  if (!dataSource) {
    throw fail('DATA_SOURCE_NOT_FOUND', 404);
  }
  if (!dataSource.branchId) {
    throw fail('DATA_SOURCE_NO_BRANCH', 400);
  }

  const branch = await prisma.branch.findUnique({
    where: { id: dataSource.branchId },
    select: { kind: true, timezone: true, currency: true },
  });
  // A warehouse has no till, so it has no sales to import. The app only offers
  // trading branches; this is the server refusing the same thing.
  if (branch.kind === 'WAREHOUSE') {
    throw fail('BRANCH_IS_WAREHOUSE', 400);
  }

  const syncRun = await prisma.syncRun.create({
    data: { dataSourceConnectionId, status: 'RUNNING', sourceFileName: file.originalname },
  });

  try {
    const rows = parseFileToRows(file.buffer);
    if (rows.length === 0) {
      throw fail('FILE_NO_ROWS', 400);
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });

    const result = await ingestRows(rows, {
      businessId,
      branchId: dataSource.branchId,
      // The same choice the counter makes, so a branch's sales are in one
      // currency whichever way they arrived.
      currency: branch.currency || business.defaultCurrency,
      // A time in the file is the shop's clock, not the server's.
      timeZone: safeZone(branch.timezone, business.timezone),
      dataSourceConnectionId,
    });

    const importedCount = result.transactionsCreated + result.transactionsUpdated;
    const status = result.recordsFailed === 0 ? 'SUCCESS' : importedCount > 0 ? 'PARTIAL' : 'FAILED';

    const updatedSyncRun = await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        finishedAt: new Date(),
        recordsIngested: importedCount,
        errorMessage: result.errors.length ? result.errors.slice(0, 20).join('\n') : null,
      },
    });

    await prisma.dataSourceConnection.update({
      where: { id: dataSourceConnectionId },
      data: { status: 'CONNECTED', lastSyncedAt: new Date() },
    });

    return { syncRun: updatedSyncRun, ...result };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage: err.message },
    });
    await prisma.dataSourceConnection.update({
      where: { id: dataSourceConnectionId },
      data: { status: 'ERROR' },
    });
    throw err;
  }
}

module.exports = { createDataSource, listDataSources, listSyncRuns, uploadFile };
