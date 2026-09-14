const INDUSTRIES = ['RETAIL', 'FOOD_BEVERAGE', 'SERVICES', 'FRANCHISE_OTHER'];

function validateSignup(body) {
  const errors = [];

  if (!body.email || typeof body.email !== 'string' || !/^\S+@\S+\.\S+$/.test(body.email)) {
    errors.push('A valid email is required');
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    errors.push('password must be at least 8 characters');
  }
  if (!body.businessName || typeof body.businessName !== 'string') {
    errors.push('businessName is required');
  }
  if (!body.industry || !INDUSTRIES.includes(body.industry)) {
    errors.push(`industry must be one of ${INDUSTRIES.join(', ')}`);
  }
  if (!body.country || typeof body.country !== 'string') {
    errors.push('country is required');
  }
  if (!body.defaultCurrency || typeof body.defaultCurrency !== 'string') {
    errors.push('defaultCurrency is required');
  }
  if (!body.timezone || typeof body.timezone !== 'string') {
    errors.push('timezone is required');
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
