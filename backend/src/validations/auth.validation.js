const { isValidEmail } = require('./shared');

const INDUSTRIES = ['RETAIL', 'FOOD_BEVERAGE', 'SERVICES', 'FRANCHISE_OTHER'];

function validateSignup(body) {
  const errors = [];

  if (!isValidEmail(body.email)) {
    errors.push('A valid email is required');
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  // Business fields are only truly required when this signup isn't claiming
  // a pending invite (auth.service.js enforces that contextually — this
  // function has no DB access to check for one). If given at all, though,
  // they must be well-formed.
  if (body.businessName !== undefined && body.businessName !== null && typeof body.businessName !== 'string') {
    errors.push('businessName must be a string');
  }
  if (body.industry !== undefined && body.industry !== null && !INDUSTRIES.includes(body.industry)) {
    errors.push(`industry must be one of ${INDUSTRIES.join(', ')}`);
  }
  if (body.country !== undefined && body.country !== null && typeof body.country !== 'string') {
    errors.push('country must be a string');
  }
  if (
    body.defaultCurrency !== undefined &&
    body.defaultCurrency !== null &&
    typeof body.defaultCurrency !== 'string'
  ) {
    errors.push('defaultCurrency must be a string');
  }
  if (body.timezone !== undefined && body.timezone !== null && typeof body.timezone !== 'string') {
    errors.push('timezone must be a string');
  }

  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email) errors.push('email is required');
  if (!body.password) errors.push('password is required');
  return errors;
}

module.exports = { validateSignup, validateLogin };
