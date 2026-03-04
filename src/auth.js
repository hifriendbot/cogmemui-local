/**
 * Bearer token authentication middleware.
 */

function validateAuth(req, token) {
	const header = req.headers['authorization'] || '';
	if (!header.startsWith('Bearer ')) {
		return false;
	}
	const provided = header.slice(7);
	if (!provided || !token) {
		return false;
	}
	// Constant-time comparison to prevent timing attacks.
	if (provided.length !== token.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < provided.length; i++) {
		mismatch |= provided.charCodeAt(i) ^ token.charCodeAt(i);
	}
	return mismatch === 0;
}

module.exports = { validateAuth };
