const { readOperator } = require('../legal/operator');
const { renderPrivacy, renderDeleteAccount } = require('../legal/pages');

// Read per request rather than once at boot, so setting the operator's details
// on the host and restarting is enough — and so a test can set them.
function send(res, html) {
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(html);
}

function privacy(req, res) {
  send(res, renderPrivacy(readOperator()));
}

function deleteAccount(req, res) {
  send(res, renderDeleteAccount(readOperator()));
}

module.exports = { privacy, deleteAccount };
