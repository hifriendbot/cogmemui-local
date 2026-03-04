const { execFile } = require('child_process');

// Shell metacharacters that indicate injection attempts.
const SHELL_META = /[;|&`$(){}><!\n\r]/;

function execute(input, config) {
	if (!config.shell_enabled) {
		return {
			content: 'Shell commands are disabled. Edit ~/.cogmemui-local/config.json and set shell_enabled to true.',
			is_error: true,
		};
	}

	const { command } = input;
	if (!command) return { content: 'The command parameter is required.', is_error: true };

	// Parse command into executable + arguments.
	const parts = command.trim().split(/\s+/);
	const cmdBase = parts[0];
	const cmdArgs = parts.slice(1);

	// Reject shell metacharacters in the full command.
	if (SHELL_META.test(command)) {
		return {
			content: 'Command contains disallowed shell metacharacters. Use simple commands only (no pipes, redirects, or chaining).',
			is_error: true,
		};
	}

	// Validate against whitelist.
	const whitelist = config.command_whitelist || [];
	if (whitelist.length > 0) {
		// Also check basename for full paths.
		const cmdName = cmdBase.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
		const allowed = whitelist.some(w => w === cmdBase || w === cmdName);
		if (!allowed) {
			return {
				content: "Command '" + cmdBase + "' is not in the whitelist. Allowed: " + whitelist.join(', '),
				is_error: true,
			};
		}
	}

	return new Promise((resolve) => {
		const timeout = 30000; // 30s
		// Use execFile (no shell) to prevent metacharacter interpretation.
		const child = execFile(cmdBase, cmdArgs, {
			timeout,
			cwd: process.cwd(),
			maxBuffer: 1024 * 1024, // 1MB
			windowsHide: true,
		}, (error, stdout, stderr) => {
			let output = '';
			if (stdout) output += stdout;
			if (stderr) output += (output ? '\n\nSTDERR:\n' : '') + stderr;
			if (output.length > 50000) {
				output = output.substring(0, 50000) + '\n... (output truncated)';
			}

			const exitCode = error ? (error.code || 1) : 0;
			resolve({
				content: 'Exit code: ' + exitCode + '\n' + output,
				is_error: exitCode !== 0,
			});
		});
	});
}

module.exports = { execute };
