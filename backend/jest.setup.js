// Jest sets NODE_ENV=test itself, so the suite loads .env.test and never
// touches the development database. Before this, jest.setup.js loaded plain
// .env and every run wrote its fixture businesses, users and payslips into
// the same database being clicked through by hand.
//
// dotenv never overwrites a variable that is already set, so CI — which
// exports DATABASE_URL directly and ships no .env.test — is unaffected.
const path = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
require('dotenv').config({ path });

// Guard rail rather than a convention: a missing or mistyped .env.test would
// otherwise fall through to whatever DATABASE_URL happened to be exported and
// quietly destroy real data. The development database is named `buisnessops`,
// which matches neither clause; `buisnessops_test` and CI's `buisnessops_ci` do.
const url = process.env.DATABASE_URL || '';
if (!/test|_ci/i.test(url)) {
  throw new Error(
    `Refusing to run the test suite against DATABASE_URL "${url.replace(/:[^:@/]*@/, ':***@')}" — ` +
      'it does not look like a test database. Create backend/.env.test pointing at ' +
      'buisnessops_test (see Docs/TESTING_GUIDE.md).'
  );
}
