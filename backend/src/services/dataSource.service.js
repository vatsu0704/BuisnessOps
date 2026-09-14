const prisma = require('../config/db');
const { parseFileToRows, ingestRows } = require('./ingestion.service');

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
    const err = new Error('Data source not found in this business');
    err.status = 404;
    throw err;
  }
  if (!dataSource.branchId) {
    const err = new Error('This data source has no branch assigned — set branchId when creating it before uploading');
    err.status = 400;
    throw err;
  }

  const syncRun = await prisma.syncRun.create({
    data: { dataSourceConnectionId, status: 'RUNNING', sourceFileName: file.originalname },
  });

  try {
    const rows = parseFileToRows(file.buffer);
    if (rows.length === 0) {
      const err = new Error('File has no data rows');
      err.status = 400;
      throw err;
    }

    const business = await prisma.business.findUnique({ where: { id: businessId } });

    const result = await ingestRows(rows, {
      businessId,
      branchId: dataSource.branchId,
      currency: business.defaultCurrency,
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
