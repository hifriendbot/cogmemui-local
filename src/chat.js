/**
 * Chat module — spawns Claude CLI for AI conversations.
 *
 * Uses `claude -p` with the user's existing subscription auth.
 * Translates CLI stream-json output into CogmemUI SSE events.
 */

const { spawn, execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Session map: conversationId -> { sessionId, lastUsed }
const sessions = new Map();

// Concurrency limit for Claude CLI processes.
const MAX_CONCURRENT_CHATS = 3;
let activeChatCount = 0;

// Claude CLI detection result (set at startup).
let claudeStatus = { available: false, version: null };
let claudePath = 'claude'; // Resolved full path for shell-free spawn.

/**
 * Detect if `claude` CLI is available in PATH.
 */
function detectClaude() {
	try {
		// Resolve full path so we can spawn without shell.
		if (process.platform === 'win32') {
			try {
				claudePath = execSync('where claude', { encoding: 'utf8', windowsHide: true }).trim().split('\n')[0].trim();
			} catch (_) {
				claudePath = 'claude';
			}
		}
		const out = execFileSync(claudePath, ['--version'], {
			timeout: 5000,
			windowsHide: true,
			encoding: 'utf8',
		});
		const version = out.trim().replace(/\s*\(Claude Code\)\s*/, '');
		claudeStatus = { available: true, version: version };
	} catch (e) {
		claudeStatus = { available: false, version: null };
	}
	return claudeStatus;
}

/**
 * Check if chat is available.
 */
function isAvailable() {
	return claudeStatus.available;
}

/**
 * Get current status.
 */
function getStatus() {
	return claudeStatus;
}

/**
 * Handle a chat request — spawn Claude CLI and stream SSE back.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {object} body  Parsed JSON body
 * @param {object} config
 */
function handleChat(req, res, body, config) {
	// Enforce concurrency limit.
	if (activeChatCount >= MAX_CONCURRENT_CHATS) {
		res.setHeader('Content-Type', 'application/json');
		res.writeHead(429);
		res.end(JSON.stringify({ error: 'Too many concurrent chat sessions. Try again shortly.' }));
		return;
	}

	if (!claudeStatus.available) {
		res.setHeader('Content-Type', 'application/json');
		res.writeHead(503);
		res.end(JSON.stringify({ error: 'Claude CLI not available.' }));
		return;
	}

	// Sanitize inputs to prevent injection.
	const conversationId = String(body.conversation_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
	const message = body.message || '';
	const systemPrompt = body.system_prompt || '';
	const memoryContext = body.memory_context || '';
	const history = Array.isArray(body.history) ? body.history : [];
	// Validate model: only allow alphanumeric, hyphens, dots, colons, underscores.
	const model = String(body.model || '').replace(/[^a-zA-Z0-9._:-]/g, '');
	const images = Array.isArray(body.images) ? body.images : [];
	const cogmemaiApiKey = body.cogmemai_api_key || '';

	if (!message) {
		res.setHeader('Content-Type', 'application/json');
		res.writeHead(400);
		res.end(JSON.stringify({ error: 'message is required.' }));
		return;
	}

	// Save attached images to temp files so the CLI can read them.
	const tempImagePaths = [];
	for (const img of images) {
		if (img.data && img.media_type) {
			try {
				const rawExt = String(img.media_type.split('/')[1] || 'png');
			const allowedExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
			const ext = allowedExts.includes(rawExt) ? rawExt : 'png';
				const fname = 'cogmemui-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
				const fpath = path.join(os.tmpdir(), fname);
				fs.writeFileSync(fpath, Buffer.from(img.data, 'base64'));
				tempImagePaths.push(fpath);
			} catch (e) {
				console.warn('Failed to save temp image:', e.message);
			}
		}
	}

	// Build image instruction for the prompt.
	let imageInstruction = '';
	if (tempImagePaths.length > 0) {
		imageInstruction = '\n\nIMPORTANT: The user has attached ' + tempImagePaths.length + ' image file(s). ' +
			'You MUST use your Read tool to read ' + (tempImagePaths.length === 1 ? 'this file' : 'each file') +
			' before responding:\n' +
			tempImagePaths.map(p => p).join('\n') +
			'\nRead the image ' + (tempImagePaths.length === 1 ? 'file' : 'files') + ' now and respond based on what you see.';
	}

	// Check for existing session to resume.
	const session = sessions.get(conversationId);
	const args = ['-p', '--output-format', 'stream-json', '--verbose'];

	// Generate MCP config for CogmemAi if the user has an API key.
	let mcpConfigPath = null;
	if (cogmemaiApiKey) {
		const cogmemaiMcpPath = path.join(__dirname, '..', 'node_modules', 'cogmemai-mcp', 'build', 'index.js');
		if (fs.existsSync(cogmemaiMcpPath)) {
			const mcpConfig = {
				mcpServers: {
					cogmemai: {
						command: 'node',
						args: [cogmemaiMcpPath],
						env: { COGMEMAI_API_KEY: cogmemaiApiKey },
					},
				},
			};
			mcpConfigPath = path.join(os.tmpdir(), 'cogmemui-mcp-' + conversationId + '.json');
			fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig), { mode: 0o600 });
			args.push('--mcp-config', mcpConfigPath);
			args.push('--allowedTools', 'mcp__cogmemai__*');
		}
	}

	// Grant CLI read access to temp directory for attached images.
	if (tempImagePaths.length > 0) {
		args.push('--add-dir', os.tmpdir());
	}
	let stdinPrompt = null;

	if (session && session.sessionId) {
		// Resume existing session — CLI has full conversation context.
		args.push('--resume', session.sessionId);
		stdinPrompt = message + imageInstruction;
	} else {
		// New conversation — inject system prompt + memories + history.
		let fullPrompt = '';

		if (systemPrompt) {
			fullPrompt += '<system_instructions>\n' + systemPrompt + '\n</system_instructions>\n\n';
		}
		if (memoryContext) {
			fullPrompt += '<memory_context>\n' + memoryContext + '\n</memory_context>\n\n';
		}
		if (history.length > 0) {
			fullPrompt += '<conversation_history>\n';
			for (let i = 0; i < history.length; i++) {
				const msg = history[i];
				const role = msg.role || 'user';
				const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				fullPrompt += '<' + role + '>\n' + content + '\n</' + role + '>\n';
			}
			fullPrompt += '</conversation_history>\n\n';
		}

		fullPrompt += message + imageInstruction;
		stdinPrompt = fullPrompt;
	}

	if (model) {
		args.push('--model', model);
	}

	// Set SSE headers.
	const corsOrigin = res.getHeader('Access-Control-Allow-Origin');
	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-store',
		'Connection': 'keep-alive',
		'X-Accel-Buffering': 'no',
		...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
	});
	res.write(': connected\n\n');

	// State for tracking response.
	const state = {
		fullResponse: '',
		tokensIn: 0,
		tokensOut: 0,
		sessionId: null,
		totalCost: 0,
		toolCallCounter: 0,
	};

	const startTime = Date.now();

	activeChatCount++;

	// Spawn the Claude CLI process.
	// Use stdin for the prompt to avoid cmd.exe mangling angle brackets and special chars.
	// On Windows, use shell:true so cmd.exe resolves the executable.
	// Join args into the command string to avoid DEP0190 deprecation warning.
	const useShell = process.platform === 'win32';
	const child = useShell
		? spawn(claudePath + ' ' + args.join(' '), [], {
			windowsHide: true,
			shell: true,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, CLAUDECODE: undefined },
		})
		: spawn(claudePath, args, {
			windowsHide: true,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, CLAUDECODE: undefined },
		});

	// Pipe prompt via stdin so it bypasses shell argument parsing.
	if (stdinPrompt) {
		child.stdin.write(stdinPrompt);
		child.stdin.end();
	}

	let lineBuffer = '';
	let stderrBuffer = '';
	let childExited = false;

	// 5-minute timeout.
	const timeout = setTimeout(() => {
		if (!childExited && !child.killed) {
			child.kill('SIGTERM');
			sendSSE(res, 'error', { message: 'Claude CLI timed out after 5 minutes.' });
			res.end();
		}
	}, 5 * 60 * 1000);

	// Keepalive to prevent connection drops.
	const keepalive = setInterval(() => {
		if (!childExited) {
			res.write(': keepalive\n\n');
		}
	}, 3000);

	// Process stdout line by line.
	child.stdout.on('data', (chunk) => {
		lineBuffer += chunk.toString();
		const lines = lineBuffer.split('\n');
		lineBuffer = lines.pop(); // Keep incomplete last line.

		for (const line of lines) {
			if (line.trim()) {
				processLine(line.trim(), res, state);
			}
		}
	});

	// Capture stderr for error detection.
	child.stderr.on('data', (chunk) => {
		stderrBuffer += chunk.toString();
		// Check for auth issues.
		if (stderrBuffer.includes('not signed in') || stderrBuffer.includes('authentication') || stderrBuffer.includes('login')) {
			sendSSE(res, 'error', { message: 'Claude CLI authentication required. Run "claude login" in your terminal.' });
		}
	});

	// Handle process exit.
	child.on('close', (code) => {
		activeChatCount = Math.max(0, activeChatCount - 1);
		childExited = true;
		clearTimeout(timeout);
		clearInterval(keepalive);

		// Clean up temp files.
		for (const tp of tempImagePaths) {
			try { fs.unlinkSync(tp); } catch (_) {}
		}
		if (mcpConfigPath) {
			try { fs.unlinkSync(mcpConfigPath); } catch (_) {}
		}

		// Process any remaining buffer.
		if (lineBuffer.trim()) {
			processLine(lineBuffer.trim(), res, state);
		}

		// Store session for resumption.
		if (state.sessionId && conversationId) {
			sessions.set(conversationId, {
				sessionId: state.sessionId,
				lastUsed: Date.now(),
			});
		}

		const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
		const preview = state.fullResponse.substring(0, 80).replace(/\n/g, ' ');
		console.log('[' + new Date().toISOString() + '] reply (' + elapsed + 's, ' + state.tokensIn + '/' + state.tokensOut + ' tokens) <- ' + preview + (state.fullResponse.length > 80 ? '...' : ''));

		// If we got an error exit with no response, send error.
		if (code !== 0 && !state.fullResponse) {
			const errMsg = stderrBuffer.trim().split('\n').pop() || 'Claude CLI exited with code ' + code;
			sendSSE(res, 'error', { message: errMsg });
		}

		// Send done event.
		sendSSE(res, 'done', {
			full_response: state.fullResponse,
			tokens_in: state.tokensIn,
			tokens_out: state.tokensOut,
			elapsed: parseFloat(elapsed),
			session_id: state.sessionId,
			cost_usd: state.totalCost,
		});

		res.end();
	});

	// Handle child process error (e.g. command not found).
	child.on('error', (err) => {
		childExited = true;
		clearTimeout(timeout);
		clearInterval(keepalive);
		sendSSE(res, 'error', { message: 'Failed to start Claude CLI: ' + err.message });
		res.end();
	});

	// Handle client disconnect.
	req.on('close', () => {
		if (!childExited && !child.killed) {
			child.kill('SIGTERM');
		}
		clearTimeout(timeout);
		clearInterval(keepalive);
	});
}

/**
 * Process a single line of stream-json output.
 *
 * Claude CLI stream-json outputs one JSON object per line:
 * - { type: "assistant", message: { content: [...], usage: {...} }, session_id }
 * - { type: "user", message: { content: [tool_result, ...] }, session_id }
 * - { type: "result", subtype: "success"|"error", cost_usd, session_id, ... }
 * - { type: "system", ... } — session init
 */
function processLine(line, res, state) {
	let parsed;
	try {
		parsed = JSON.parse(line);
	} catch (e) {
		return; // Skip non-JSON lines.
	}

	if (parsed.type === 'assistant' && parsed.message) {
		const msg = parsed.message;

		// Track tokens.
		if (msg.usage) {
			if (msg.usage.input_tokens) state.tokensIn += msg.usage.input_tokens;
			if (msg.usage.output_tokens) state.tokensOut += msg.usage.output_tokens;
		}

		// Track session ID.
		if (parsed.session_id) {
			state.sessionId = parsed.session_id;
		}

		// Process content blocks.
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === 'text' && block.text) {
					state.fullResponse += block.text;
					sendSSE(res, 'token', { text: block.text });
				} else if (block.type === 'tool_use') {
					state.toolCallCounter++;
					const toolCallId = block.id || 'local_tc_' + state.toolCallCounter;
					// Emit tool start.
					sendSSE(res, 'tool_start', {
						tool_call_id: toolCallId,
						tool_name: block.name || 'unknown',
					});
					// Emit tool input complete (we get the full input at once from stream-json).
					sendSSE(res, 'tool_input_complete', {
						tool_call_id: toolCallId,
						tool_name: block.name || 'unknown',
						input: block.input || {},
					});
					// Mark as executing (CLI handles execution internally).
					sendSSE(res, 'tool_executing', {
						tool_call_id: toolCallId,
					});
				}
			}
		}

	} else if (parsed.type === 'user' && parsed.message) {
		// Tool results from the CLI's own execution.
		const msg = parsed.message;
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === 'tool_result') {
					const toolUseId = block.tool_use_id || '';
					const isError = !!block.is_error;
					let resultText = '';
					if (typeof block.content === 'string') {
						resultText = block.content;
					} else if (Array.isArray(block.content)) {
						resultText = block.content
							.filter(c => c.type === 'text')
							.map(c => c.text)
							.join('\n');
					}
					sendSSE(res, isError ? 'tool_error' : 'tool_result', {
						tool_call_id: toolUseId,
						result: resultText,
					});
				}
			}
		}

	} else if (parsed.type === 'result') {
		// Final result — extract session_id and cost.
		if (parsed.session_id) {
			state.sessionId = parsed.session_id;
		}
		if (parsed.total_cost_usd) {
			state.totalCost = parsed.total_cost_usd;
		}
		if (parsed.cost_usd) {
			state.totalCost = parsed.cost_usd;
		}

	} else if (parsed.type === 'system') {
		// Session init — track session ID.
		if (parsed.session_id) {
			state.sessionId = parsed.session_id;
		}
	}
}

/**
 * Send an SSE event.
 */
function sendSSE(res, event, data) {
	try {
		res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
	} catch (e) {
		// Connection may have closed.
	}
}

// Session cleanup — prune sessions older than 4 hours every 30 minutes.
setInterval(() => {
	const cutoff = Date.now() - 4 * 60 * 60 * 1000;
	for (const [key, val] of sessions) {
		if (val.lastUsed < cutoff) {
			sessions.delete(key);
		}
	}
}, 30 * 60 * 1000);

module.exports = { detectClaude, isAvailable, getStatus, handleChat };
