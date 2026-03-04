/**
 * Bearer token authentication middleware.
 */

const crypto = require('crypto');

function validateAuth(req, token) {
	const header = req.headers['authorization'] || '';
	if (!header.startsWith('Bearer ')) {
		return false;
	}
	const provided = header.slice(7);
	if (!provided || !token) {
		return false;
	}
	// Use SHA-256 hash comparison to avoid length leaks and ensure constant time.
	const a = crypto.createHash('sha256').update(provided).digest();
	const b = crypto.createHash('sha256').update(token).digest();
	return crypto.timingSafeEqual(a, b);
}

module.exports = { validateAuth };
