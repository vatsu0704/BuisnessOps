const { mustBeOneOf } = require('./shared');

const LOCALES = ['EN', 'HI', 'GU', 'MR'];

function validateUpdateLocale(body) {
  const errors = [];

  if (!body.preferredLocale || !LOCALES.includes(body.preferredLocale)) {
    errors.push(mustBeOneOf('preferredLocale', LOCALES));
  }

  return errors;
}

module.exports = { validateUpdateLocale, LOCALES };
