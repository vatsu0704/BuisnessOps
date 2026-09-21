const { API_MESSAGES, FIELD_MESSAGES } = require('./catalog');

/**
 * Error construction and rendering for the whole API.
 *
 * Before this, every throw site built its own `new Error('...')` and set
 * `err.status` by hand, which meant the English text was the only identity an
 * error had. A client could not react to a specific failure without matching on
 * prose, and translating anything meant translating at the throw site — in a
 * process that does not know the reader's language.
 *
 * See `catalog.js` for why the text lives there and the translation happens on
 * the client.
 */

function interpolate(template, params) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key])
  );
}

/** English rendering of a code, for the fallback `message` and for logs. */
function renderMessage(code, params = {}) {
  const template = API_MESSAGES[code] ?? FIELD_MESSAGES[code];
  // An unknown code is a bug in this codebase, not something a caller can
  // cause. Surfacing the code itself beats an empty string, because it names
  // the thing to go and add.
  if (!template) return code;
  return interpolate(template, params);
}

/**
 * A failure meant to be shown to a person.
 *
 * `code` is the contract; `status` is how HTTP expresses it; `params` are the
 * values the sentence needs in whichever language it ends up rendered in.
 */
class ApiError extends Error {
  constructor(code, status = 400, params = {}) {
    super(renderMessage(code, params));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}

/**
 * Throw helper: `throw fail('BRANCH_NOT_FOUND', 404)`.
 *
 * Replaces the four-line `const err = new Error(...); err.status = ...; throw
 * err;` that appeared 41 times, which is also where the status occasionally
 * got forgotten and fell through to a 500.
 */
function fail(code, status = 400, params = {}) {
  return new ApiError(code, status, params);
}

/** One rejected field, for a validation result. */
function fieldError(code, field, params = {}) {
  return { code, field, params };
}

/**
 * The body of a 400 from a failed validation.
 *
 * `errors` stays a plain array of English strings, exactly the shape it has
 * always had, so an app build from before this change still renders something
 * readable rather than `[object Object]`. It is rendered from `details` rather
 * than written separately, so the two can never disagree.
 */
function validationFailure(details) {
  return {
    code: 'VALIDATION_FAILED',
    message: renderMessage('VALIDATION_FAILED'),
    errors: details.map((detail) => renderMessage(detail.code, { field: detail.field, ...detail.params })),
    details,
  };
}

module.exports = { ApiError, fail, fieldError, validationFailure, renderMessage };
