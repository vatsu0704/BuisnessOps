const dataSourceService = require('../services/dataSource.service');
const { fail, validationFailure } = require('../errors');
const { validateCreateDataSource } = require('../validations/dataSource.validation');

async function createDataSource(req, res, next) {
  try {
    const errors = validateCreateDataSource(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const dataSource = await dataSourceService.createDataSource(req.tenant.businessId, req.body);
    res.status(201).json(dataSource);
  } catch (err) {
    next(err);
  }
}

async function listDataSources(req, res, next) {
  try {
    const dataSources = await dataSourceService.listDataSources(req.tenant.businessId);
    res.json(dataSources);
  } catch (err) {
    next(err);
  }
}

async function listSyncRuns(req, res, next) {
  try {
    const syncRuns = await dataSourceService.listSyncRuns(req.tenant.businessId, req.params.dataSourceId);
    res.json(syncRuns);
  } catch (err) {
    next(err);
  }
}

async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      throw fail('FILE_REQUIRED', 400);
    }
    const result = await dataSourceService.uploadFile(req.tenant.businessId, req.params.dataSourceId, req.file);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createDataSource, listDataSources, listSyncRuns, uploadFile };
