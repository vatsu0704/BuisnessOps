const EMAIL_RE = /^\S+@\S+\.\S+$/;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value);
}

module.exports = { isValidEmail };
