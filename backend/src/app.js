const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requestId, accessLog } = require('./middleware/requestLog');

const app = express();

/**
 * Behind exactly one proxy — the host's TLS terminator.
 *
 * Without this, Express reports every request as coming from the proxy, so the
 * rate limiter in middleware/rateLimit.js would count the whole world as one
 * client and lock everybody out together on the first attack. `1` rather than
 * `true` on purpose: trusting the whole chain lets a client put whatever it
 * likes in X-Forwarded-For and pick its own identity, which would make the
 * limiter decorative.
 */
app.set('trust proxy', 1);

// First, so that everything below — a CORS rejection, a rate-limit refusal, a
// 500 from the far end of a controller — can be reported against the same id,
// and so the caller gets it back on every response including the failures.
app.use(requestId);

app.use(helmet());

/**
 * Who may call this API from a browser.
 *
 * Unset means any origin, which is what this has always done and is what the
 * development web build (`npm run web`, served from localhost:8081) and the
 * native app need — a React Native app sends no Origin header and is not
 * subject to CORS at all, so tightening this by default would break the browser
 * preview and protect nobody.
 *
 * Set `CORS_ORIGINS` in production, as a comma-separated list. It matters there
 * because the web build is a real deployment target: without it, any page on
 * any site can call this API from a signed-in person's browser.
 */
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));

app.use(express.json());
app.use(accessLog);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
