require('dotenv').config();

// Before anything else, and before `app` is even required: a missing or
// placeholder JWT_SECRET is not something to discover at the first login.
const { assertEnv } = require('./config/env');

assertEnv();

const app = require('./app');
const prisma = require('./config/db');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/**
 * Let in-flight requests finish, then hand the database connections back.
 *
 * A host restarts a service by sending SIGTERM and waiting; with no handler the
 * process is killed outright, which drops whatever requests were mid-flight and
 * leaves Postgres holding connections until it times them out. On a small
 * instance with a connection cap, a few restarts in a row was enough to exhaust
 * it.
 */
function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // A request that never finishes must not hold the process open forever.
  setTimeout(() => process.exit(1), 10000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal));
}
