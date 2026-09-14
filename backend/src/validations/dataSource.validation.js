const SYNC_FREQUENCIES = ['MANUAL', 'HOURLY', 'DAILY'];

function validateCreateDataSource(body) {
  const errors = [];
  if (!body.provider || typeof body.provider !== 'string') {
    errors.push('provider is required (e.g. CSV_UPLOAD)');
  }
  if (!body.displayName || typeof body.displayName !== 'string') {
    errors.push('displayName is required');
  }
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push('branchId must be a string');
  }
  if (body.syncFrequency && !SYNC_FREQUENCIES.includes(body.syncFrequency)) {
    errors.push(`syncFrequency must be one of ${SYNC_FREQUENCIES.join(', ')}`);
  }
  return errors;
}

module.exports = { validateCreateDataSource };
