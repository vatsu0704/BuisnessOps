const { ApiError, renderMessage } = require('../errors');

// Every error response carries the same three things: a stable `code` the
// client can translate and branch on, the English rendering as `message` (the
// fallback for a client that has not heard of the code, and what curl and the
// logs show), and whatever `params` that sentence needs in any language.
function send(res, status, code, params = {}) {
  return res.status(status).json({ code, message: renderMessage(code, params), params });
}

function notFound(req, res, next) {
  return send(res, 404, 'ROUTE_NOT_FOUND', { path: req.originalUrl });
}

// Prisma errors are caught here rather than per-service so every model's
// unique/foreign-key constraints get a clean response without needing
// hand-written pre-checks everywhere — the alternative (letting them fall
// through to the generic 500 below) leaks internal file paths and raw
// query internals straight into the API response.
//
// These are matched before anything else precisely because Prisma also puts a
// `code` on its errors ('P2002'), as do Node's own system errors ('ENOENT') —
// which is why "is this one of ours?" below asks `instanceof ApiError` rather
// than trusting the presence of a code.
function errorHandler(err, req, res, next) {
  if (err.code === 'P2002') {
    const fields = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    return send(res, 409, 'RECORD_DUPLICATE', { fields: fields || 'value' });
  }
  if (err.code === 'P2025') {
    return send(res, 404, 'RECORD_NOT_FOUND');
  }
  if (err.code === 'P2003') {
    return send(res, 400, 'RECORD_REFERENCE_MISSING');
  }

  if (err instanceof ApiError) {
    return send(res, err.status, err.code, err.params);
  }

  // Nothing else in this codebase should reach here with a 4xx — every
  // deliberate failure is an ApiError. A library's error can, though (multer's
  // upload limits, for one), so its message is passed through under a code
  // that says plainly that it has no translation of its own.
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ code: 'REQUEST_FAILED', message: err.message, params: {} });
  }

  // Unplanned. The message can carry stack paths and query internals, so it
  // goes to the server log rather than to the client — but it must go
  // somewhere, or a 500 becomes five words with nothing behind them.
  if (process.env.NODE_ENV !== 'test') console.error('[api] unhandled error:', err);
  return send(res, 500, 'INTERNAL_ERROR');
}

module.exports = { notFound, errorHandler };
