const { INDUSTRIES, isValidEmail, mustBeString, mustBeOneOf, required } = require('./shared');
const { fieldError } = require('../errors');

function validateSignup(body) {
  const errors = [];

  if (!isValidEmail(body.email)) {
    errors.push(fieldError('EMAIL_REQUIRED', 'email'));
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    errors.push(fieldError('PASSWORD_TOO_SHORT', 'password', { min: 8 }));
  }

  // Business fields are only truly required when this signup isn't claiming
  // a pending invite (auth.service.js enforces that contextually — this
  // function has no DB access to check for one). If given at all, though,
  // they must be well-formed.
  if (body.businessName !== undefined && body.businessName !== null && typeof body.businessName !== 'string') {
    errors.push(mustBeString('businessName'));
  }
  if (body.industry !== undefined && body.industry !== null && !INDUSTRIES.includes(body.industry)) {
    errors.push(mustBeOneOf('industry', INDUSTRIES));
  }
  if (body.country !== undefined && body.country !== null && typeof body.country !== 'string') {
    errors.push(mustBeString('country'));
  }
  if (
    body.defaultCurrency !== undefined &&
    body.defaultCurrency !== null &&
    typeof body.defaultCurrency !== 'string'
  ) {
    errors.push(mustBeString('defaultCurrency'));
  }
  if (body.timezone !== undefined && body.timezone !== null && typeof body.timezone !== 'string') {
    errors.push(mustBeString('timezone'));
  }

  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email) errors.push(required('email'));
  if (!body.password) errors.push(required('password'));
  return errors;
}

module.exports = { validateSignup, validateLogin };
