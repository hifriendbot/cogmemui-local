const http = require('http');
const { validateAuth } = require('./auth');
const { handleCors } = require('./cors');
const tools = require('./tools');
const chat = require('./chat');

function createServer(config) {
	const server = http.createServer(async (req, res) => {
		// CORS handling.
		if (handleCors(req, res, config.allowed_origins)) return;

		// Auth check (skip OPTIONS, handled above).
		if (!validateAuth(req, config.token)) {
			res.setHeader('Content-Type', 'application/json');
			res.writeHead(401);
			res.end(JSON.stringify({ error: 'Invalid or missing bearer token' }));
			return;
		}

		const url = new URL(req.url, 'http://localhost');
		const pathname = url.pathname;

		try {
			if (req.method === 'GET' && pathname === '/health') {
				const chatStatus = chat.getStatus();
				return sendJson(res, 200, {
					status: 'ok',
					version: '1.1.7',
					tools: tools.getDefinitions().length,
					hostname: require('os').hostname(),
					platform: process.platform,
					allowed_directories: config.allowed_directories,
					shell_enabled: config.shell_enabled,
					chat_available: chatStatus.available,
					claude_version: chatStatus.version || null,
				});
			}

			if (req.method === 'GET' && pathname === '/tools') {
				return sendJson(res, 200, { tools: tools.getDefinitions() });
			}

			if (req.method === 'POST' && pathname === '/tools/call') {
				const body = await readBody(req);
				const { request_id, tool_name, input } = body;

				if (!tool_name) {
					return sendJson(res, 400, { error: 'tool_name is required' });
				}

				const timestamp = new Date().toISOString();
				console.log('[' + timestamp + '] ' + tool_name + (input && input.path ? ' -> ' + input.path : ''));

				const result = await tools.dispatch(tool_name, input || {}, config);

				return sendJson(res, 200, {
					request_id: request_id || null,
					content: result.content,
					is_error: result.is_error,
					duration_ms: result.duration_ms || 0,
				});
			}

			if (req.method === 'POST' && pathname === '/chat') {
				const chatBody = await readBody(req);
				if (!chat.isAvailable()) {
					return sendJson(res, 503, {
						error: 'Claude CLI not found. Install Claude Code and run "claude login".',
					});
				}
				const timestamp = new Date().toISOString();
				console.log('[' + timestamp + '] chat -> ' + (chatBody.message || '').substring(0, 80));
				// handleChat writes SSE directly to res.
				return chat.handleChat(req, res, chatBody, config);
			}

			if (req.method === 'POST' && pathname === '/run') {
				const runBody = await readBody(req);
				const { code, lang } = runBody;
				if (!code) return sendJson(res, 400, { error: 'code is required' });
				if (!config.shell_enabled) {
					return sendJson(res, 403, { error: 'Shell execution is disabled in config.' });
				}
				const { execFile } = require('child_process');
				const cmd = lang === 'python3' ? 'python3' : 'bash';
				const timestamp = new Date().toISOString();
				console.log('[' + timestamp + '] run (' + cmd + ') ' + code.substring(0, 60));
				// Use execFile with ['-c', code] / ['-'] to avoid shell metacharacter interpretation.
				const cmdArgs = lang === 'python3' ? ['-c', code] : ['-c', code];
				const child = execFile(cmd, cmdArgs, { timeout: 10000, maxBuffer: 512 * 1024, windowsHide: true }, (error, stdout, stderr) => {
					sendJson(res, 200, {
						stdout: stdout || '',
						stderr: stderr || '',
						exitCode: error ? (error.code || 1) : 0,
					});
				});
				return;
			}

			// 404.
			sendJson(res, 404, { error: 'Not found' });
		} catch (e) {
			console.error('Server error:', e.message);
			sendJson(res, 500, { error: 'Internal server error' });
		}
	});

	return server;
}

function sendJson(res, status, data) {
	res.setHeader('Content-Type', 'application/json');
	res.writeHead(status);
	res.end(JSON.stringify(data));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		let rejected = false;
		req.on('data', chunk => {
			if (rejected) return;
			data += chunk;
			if (data.length > 5 * 1024 * 1024) {
				rejected = true;
				req.destroy();
				reject(new Error('Request body too large'));
			}
		});
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch (e) {
				reject(new Error('Invalid JSON'));
			}
		});
		req.on('error', reject);
	});
}

module.exports = { createServer };
