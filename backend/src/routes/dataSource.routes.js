const express = require('express');
const multer = require('multer');
const dataSourceController = require('../controllers/dataSource.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');
const { fail } = require('../errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(fail('UPLOAD_FAILED', 400, { reason: err.message }));
    }
    if (err) return next(err);
    next();
  });
}

const router = express.Router();

// Data source management is an OWNER/ADMIN operation (matches the System
// Administrator role in the PRD who manages data source connections).
// requirePermission is applied per-route, not as a blanket `scoped.use(...)`: this
// router is mounted at the same '/:businessId' prefix as every other
// businesses/* resource router, so a blanket gate here would reject any
// other resource's request that falls through to this router (Express
// matches mounted routers in registration order, and a non-path-scoped
// `.use()` middleware runs before route matching gets a chance to say "this
// isn't even one of my paths").
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

scoped.post('/data-sources', requirePermission('dataSource:manage'), dataSourceController.createDataSource);
scoped.get('/data-sources', requirePermission('dataSource:manage'), dataSourceController.listDataSources);
scoped.post(
  '/data-sources/:dataSourceId/upload',
  requirePermission('dataSource:manage'),
  handleUpload,
  dataSourceController.uploadFile
);
scoped.get('/data-sources/:dataSourceId/sync-runs', requirePermission('dataSource:manage'), dataSourceController.listSyncRuns);

router.use('/:businessId', scoped);

module.exports = router;
