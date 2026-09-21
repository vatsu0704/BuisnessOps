const { mustBeOneOf, mustBeString, required } = require('./shared');
const { fieldError } = require('../errors');

const SYNC_FREQUENCIES = ['MANUAL', 'HOURLY', 'DAILY'];

function validateCreateDataSource(body) {
  const errors = [];
  if (!body.provider || typeof body.provider !== 'string') {
    errors.push(fieldError('PROVIDER_REQUIRED', 'provider'));
  }
  if (!body.displayName || typeof body.displayName !== 'string') {
    errors.push(required('displayName'));
  }
  if (body.branchId !== undefined && body.branchId !== null && typeof body.branchId !== 'string') {
    errors.push(mustBeString('branchId'));
  }
  if (body.syncFrequency && !SYNC_FREQUENCIES.includes(body.syncFrequency)) {
    errors.push(mustBeOneOf('syncFrequency', SYNC_FREQUENCIES));
  }
  return errors;
}

module.exports = { validateCreateDataSource };
