const { execFile, exec } = require('child_process');

function execute(input, config) {
	if (!config.shell_enabled) {
		return {
			content: 'Shell commands are disabled. Edit ~/.cogmemui-local/config.json and set shell_enabled to true.',
			is_error: true,
		};
	}

	const { command } = input;
	if (!command) return { content: 'The command parameter is required.', is_error: true };

	// Validate against whitelist.
	const whitelist = config.command_whitelist || [];
	if (whitelist.length > 0) {
		const cmdBase = command.trim().split(/\s+/)[0];
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
		const child = exec(command, {
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
