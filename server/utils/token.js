const crypto = require('crypto');

// URL-safe, cryptographically secure, unguessable tokens (base62-ish via base64url).
function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url').slice(0, 32);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { generateToken, hashValue };
