const { isValidEmail } = require('./shared');
const { fieldError } = require('../errors');

function validateLookupQuery(query) {
  const errors = [];
  if (!isValidEmail(query.email)) errors.push(fieldError('EMAIL_REQUIRED', 'email'));
  return errors;
}

module.exports = { validateLookupQuery };
