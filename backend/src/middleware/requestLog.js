const crypto = require('crypto');
const morgan = require('morgan');

/**
 * An id per request, and one access-log line that carries it.
 *
 * Without an id, a 500 in the log and the request that caused it are two
 * unrelated facts: the error line says what broke and the access line says who
 * asked, and nothing joins them. With one, a person reporting "it failed at
 * about four" can be answered — and `X-Request-Id` comes back on the response,
 * so the id is something they can actually quote.
 */

/**
 * An id supplied by the caller is reused, so a trace started at the proxy or
 * in the app carries through rather than being renamed here.
 *
 * It is pattern-checked first, and that is not politeness: this value is
 * written verbatim into every log line for the request, so a header holding a
 * newline could forge entries in a log somebody later reads as evidence.
 * Anything that is not plainly an id is replaced rather than escaped.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

function requestId(req, res, next) {
  const supplied = req.get('X-Request-Id');
  req.id = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Morgan runs this when the response finishes, which is why `user` and
 * `business` are readable at all — `requireAuth` and `resolveTenant` have long
 * since run, and a line that said only "somebody asked for this" would be the
 * least useful half of the record.
 */
function productionFormat(tokens, req, res) {
  const status = Number(tokens.status(req, res));
  return JSON.stringify({
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : 'info',
    event: 'request',
    id: req.id,
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status,
    ms: Number(tokens['response-time'](req, res)),
    bytes: Number(tokens.res(req, res, 'content-length')) || 0,
    ip: req.ip,
    user: req.userId,
    business: req.tenant && req.tenant.businessId,
    role: req.tenant && req.tenant.role,
  });
}

/**
 * `dev` outside production is kept on purpose — it is the right format for a
 * terminal, and this project is developed with one open. The format is fixed
 * when the middleware is built because `NODE_ENV` does not change under a
 * running server; the test case is handled by `skip`, which is re-evaluated per
 * request.
 */
const accessLog = morgan(process.env.NODE_ENV === 'production' ? productionFormat : 'dev', {
  skip: () => process.env.NODE_ENV === 'test',
});

module.exports = { requestId, accessLog, SAFE_REQUEST_ID };
