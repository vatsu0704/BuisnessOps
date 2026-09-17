const inviteService = require('../services/invite.service');
const { validateLookupQuery } = require('../validations/invite.validation');

// Deliberately unauthenticated: this runs on the signup screen, before an
// account (and therefore a token) exists. Only ever returns the business
// name and role for a match on the exact email asked about — never a list,
// never anything else about the invite or business.
async function lookup(req, res, next) {
  try {
    const errors = validateLookupQuery(req.query);
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const invite = await inviteService.lookupInvite(req.query.email);
    if (!invite) return res.status(404).json({ message: 'No pending invite for this email' });
    res.json(invite);
  } catch (err) {
    next(err);
  }
}

module.exports = { lookup };
