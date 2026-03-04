/**
 * CORS middleware — restricts to allowed origins only.
 */

function handleCors(req, res, allowedOrigins) {
	const origin = req.headers['origin'] || '';

	// Check if origin is in allowed list (no wildcard — must match exactly).
	const allowed = origin && allowedOrigins.some(o => o === origin);

	if (allowed) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		res.setHeader('Access-Control-Max-Age', '86400');
	}

	// Handle preflight.
	if (req.method === 'OPTIONS') {
		if (!allowed) {
			res.writeHead(403);
			res.end('CORS: Origin not allowed');
			return true; // handled
		}
		res.writeHead(204);
		res.end();
		return true; // handled
	}

	return false; // not handled, continue
}

module.exports = { handleCors };
