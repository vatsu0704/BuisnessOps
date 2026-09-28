const { rateLimit } = require('express-rate-limit');
const { renderMessage } = require('../errors');

/**
 * A ceiling on password guessing.
 *
 * Nothing limited anything before this. Signup and login were open to as many
 * attempts per second as a script could make, against a policy whose only rule
 * is eight characters — which is a few hours of work for a common-password list
 * and gets an attacker a real session in a real business.
 *
 * ## Why only the auth routes
 *
 * A limiter across the whole API is the obvious next step and is deliberately
 * NOT taken here. Every screen in the app refetches when its tab regains focus,
 * a branch full of staff shares one shop's IP, and the number that is safe for
 * that is a number nobody can pick confidently from the outside. Getting it
 * wrong locks a busy shop out of its own till in the middle of service — worse,
 * for this product, than the thing it would be guarding against. The attack
 * that is actually worth stopping is guessing credentials, and that happens
 * here.
 *
 * ## Counting
 *
 * Keyed on IP, in memory. That is correct for a single instance and is what
 * this deployment is; running more than one would need a shared store
 * (`rate-limit-redis`), because each would otherwise keep its own count and the
 * effective limit would multiply by the instance count.
 *
 * Failures only (`skipSuccessfulRequests`), so somebody signing in and out
 * legitimately all day is never affected, and a shop where several people sign
 * in from one connection does not spend the budget just by working. The window
 * is per IP, so one person fat-fingering their password twice leaves plenty for
 * their colleagues.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** The test suite signs hundreds of accounts in and out; it is not an attacker. */
const skipWhenTesting = () => process.env.NODE_ENV === 'test';

function tooManyRequests(req, res) {
  const code = 'TOO_MANY_REQUESTS';
  // The same { code, message, params } envelope every other error uses, so the
  // app translates a 429 exactly as it translates a 403 rather than falling
  // through to "something went wrong".
  return res.status(429).json({ code, message: renderMessage(code), params: {} });
}

/**
 * Sign-in attempts. Generous enough that a person who has genuinely forgotten
 * which password they used will not meet it, tight enough that a list attack
 * is pointless.
 */
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipWhenTesting,
  handler: tooManyRequests,
});

/**
 * Account creation. Lower, and counted whether it succeeds or not: a successful
 * signup is the thing being abused, so skipping successful ones would leave the
 * limiter measuring nothing.
 */
const signupLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: skipWhenTesting,
  handler: tooManyRequests,
});

module.exports = { loginLimiter, signupLimiter };
