const LOCALES = ['EN', 'HI', 'GU', 'MR'];

function validateUpdateLocale(body) {
  const errors = [];

  if (!body.preferredLocale || !LOCALES.includes(body.preferredLocale)) {
    errors.push(`preferredLocale must be one of ${LOCALES.join(', ')}`);
  }

  return errors;
}

module.exports = { validateUpdateLocale, LOCALES };
