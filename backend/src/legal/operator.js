/**
 * Who runs KitnaPay, as the public legal pages state it.
 *
 * Read from the environment rather than written into the pages, because the
 * company does not exist yet: when it is registered, setting three variables on
 * the server is the whole change, with no build and no deploy of new code. The
 * pages read this on every request, so a restart with the new values is enough.
 *
 * Until all three are set, the pages say plainly that the operator's details are
 * still being finalised — a privacy policy that names nobody must not look as if
 * it does. `config/env.js` warns at startup in production while any are missing,
 * but does not refuse to start: the API has to run before the company exists.
 */
function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function readOperator(env = process.env) {
  return {
    name: clean(env.LEGAL_NAME),
    address: clean(env.LEGAL_ADDRESS),
    email: clean(env.SUPPORT_EMAIL),
  };
}

function isComplete(operator) {
  return Boolean(operator.name && operator.address && operator.email);
}

/** The variables still unset, by name, for the startup warning. */
function missingOperatorVariables(env = process.env) {
  const operator = readOperator(env);
  return [
    ['LEGAL_NAME', operator.name],
    ['LEGAL_ADDRESS', operator.address],
    ['SUPPORT_EMAIL', operator.email],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

module.exports = { readOperator, isComplete, missingOperatorVariables };
