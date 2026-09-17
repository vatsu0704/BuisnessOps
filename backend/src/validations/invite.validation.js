const { isValidEmail } = require('./shared');

function validateLookupQuery(query) {
  const errors = [];
  if (!isValidEmail(query.email)) errors.push('A valid email is required');
  return errors;
}

module.exports = { validateLookupQuery };
