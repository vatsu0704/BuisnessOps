const express = require('express');
const multer = require('multer');
const dataSourceController = require('../controllers/dataSource.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireRole } = require('../middleware/rbac');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload failed: ${err.message}` });
    }
    if (err) return next(err);
    next();
  });
}

const router = express.Router();

// Data source management is an OWNER/ADMIN operation (matches the System
// Administrator role in the PRD who manages data source connections).
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant, requireRole('OWNER', 'ADMIN'));

scoped.post('/data-sources', dataSourceController.createDataSource);
scoped.get('/data-sources', dataSourceController.listDataSources);
scoped.post('/data-sources/:dataSourceId/upload', handleUpload, dataSourceController.uploadFile);
scoped.get('/data-sources/:dataSourceId/sync-runs', dataSourceController.listSyncRuns);

router.use('/:businessId', scoped);

module.exports = router;
