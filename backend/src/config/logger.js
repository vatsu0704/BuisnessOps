/**
 * One line per event — JSON in production, readable prose anywhere else.
 *
 * `morgan('dev')` was the whole of this project's logging, and it is built for
 * a terminal somebody is watching: it is ANSI-coloured, carries no timestamp,
 * no request id, no account and no business, and every hosted log collector
 * stores it as unparsed text. The first production incident is the wrong
 * moment to discover that the only record of a 500 is five words with nothing
 * to join them to the request that caused it.
 *
 * This needs no dependency. A log line is a JSON object on stdout, which is
 * what every host already collects, and errors go to stderr so a platform that
 * separates the two keeps doing so.
 *
 * ## Silent under test, deliberately
 *
 * `errorHandler` already suppressed its own output that way, for the reason
 * that applies to all of it: several hundred request lines bury the one
 * assertion that actually failed. `NODE_ENV` is read on every call rather than
 * once at require time, so a test that changes it gets the behaviour it asked
 * for instead of whatever was true when the module first loaded.
 */

function isTest() {
  return process.env.NODE_ENV === 'test';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** The fields every line carries, whatever the event. */
function envelope(level, event) {
  return { ts: new Date().toISOString(), level, event };
}

function write(stream, line) {
  stream.write(`${JSON.stringify(line)}\n`);
}

/**
 * Drop keys with nothing in them, so a line about an unauthenticated request
 * does not carry `"user": null` and a reader can tell "absent" from "empty".
 */
function present(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}

function info(event, fields = {}) {
  if (isTest()) return;
  if (isProduction()) {
    write(process.stdout, { ...envelope('info', event), ...present(fields) });
    return;
  }
  console.log(`[api] ${event}`, present(fields));
}

/**
 * `err` is separate from `fields` because the two want opposite treatment: in
 * production the stack is a string on the JSON line, and in development it is
 * better handed to `console.error`, which prints an Error the way a developer
 * expects to read one.
 */
function error(event, fields = {}, err) {
  if (isTest()) return;
  if (isProduction()) {
    write(process.stderr, {
      ...envelope('error', event),
      ...present(fields),
      ...(err ? { error: err.message, stack: err.stack } : {}),
    });
    return;
  }
  console.error(`[api] ${event}`, present(fields), err || '');
}

module.exports = { info, error, isProduction, isTest };
